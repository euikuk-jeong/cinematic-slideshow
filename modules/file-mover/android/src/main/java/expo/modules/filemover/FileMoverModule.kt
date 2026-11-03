package expo.modules.filemover

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.providers.AppContextProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.Serializable
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume

private const val SCAN_TIMEOUT_MS = 15_000L
private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"
private const val PRIMARY_VOLUME = "primary"

/**
 * 미디어 폴더(DCIM/Pictures/Movies) 밖으로 사진·영상을 복사한다 — SAF(Storage Access Framework).
 *
 * MediaStore는 사진·영상의 최상위 폴더를 DCIM/Pictures/Movies로 제한해(`Primary directory X not allowed`) 그 밖의
 * 폴더(예: /storage/emulated/0/_MyData/...)로는 RELATIVE_PATH를 바꿀 수 없다. 모든 파일 접근(MANAGE_EXTERNAL_STORAGE)은
 * Play 정책상 쓸 수 없으므로, 사용자가 시스템 폴더 선택기(ACTION_OPEN_DOCUMENT_TREE)에서 고른 폴더에 대해 영구 권한을
 * 받아 그 아래에 사본을 만든다. "이동"은 JS가 복사 성공 항목의 원본을 MediaStore 삭제(또는 휴지통) 요청으로 지운다.
 *
 * 문서 id는 외부 저장소 provider 형식(`primary:<상대 경로>`)만 다룬다(SD 카드 등 다른 볼륨은 JS가 막는다).
 */
class FileMoverModule : Module() {
  private lateinit var treeLauncher: AppContextActivityResultLauncher<TreeInput, String?>

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FileMover")

    Function("isSafSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    /** 쓰기 권한이 영구 부여된 폴더들의 문서 id(`primary:_MyData` 등). */
    Function("listWritableTrees") {
      context.contentResolver.persistedUriPermissions
        .filter { it.isWritePermission && it.uri.authority == EXTERNAL_STORAGE_AUTHORITY }
        .mapNotNull { permission ->
          try {
            DocumentsContract.getTreeDocumentId(permission.uri)
          } catch (e: Exception) {
            null
          }
        }
    }

    /**
     * 시스템 폴더 선택기를 initialDocId 위치에서 연다. 사용자가 폴더를 고르면 영구 권한을 받고 그 폴더의 문서 id를,
     * 취소하면 null을 돌려준다. 고른 폴더가 원하는 위치를 포함하는지는 JS가 판정한다.
     */
    AsyncFunction("pickTree") Coroutine { initialDocId: String ->
      treeLauncher.launch(TreeInput(initialDocId))
    }

    /**
     * sources(MediaStore content URI)를 treeDocId 권한으로 destinationDocId 폴더에 복사한다. 폴더가 없으면 만든다.
     * 항목별 결과: ok(사본 생성) / skipped(이미 그 폴더에 있음 — 옮길 것이 없다) / error.
     */
    AsyncFunction("copyToTree") Coroutine { treeDocId: String, destinationDocId: String, sources: List<String> ->
      withContext(Dispatchers.IO) { copyToTree(treeDocId, destinationDocId, sources) }
    }

    RegisterActivityContracts {
      treeLauncher = registerForActivityResult(TreeContract(this@FileMoverModule))
    }
  }

  private suspend fun copyToTree(
    treeDocId: String,
    destinationDocId: String,
    sources: List<String>
  ): List<Map<String, Any?>> {
    val resolver = context.contentResolver
    val treeUri = DocumentsContract.buildTreeDocumentUri(EXTERNAL_STORAGE_AUTHORITY, treeDocId)
    val destinationUri = ensureDirectory(treeUri, treeDocId, destinationDocId)
    val destinationRelative = relativePathOf(destinationDocId)

    val results = mutableListOf<Map<String, Any?>>()
    val scanPaths = mutableListOf<String>()
    for (source in sources) {
      try {
        val sourceUri = Uri.parse(source)
        val info = querySource(sourceUri)
        if (info.relativePath != null && sameFolder(info.relativePath, destinationRelative)) {
          results.add(result(source, ok = true, skipped = true, error = null))
          continue
        }
        val created = DocumentsContract.createDocument(resolver, destinationUri, info.mimeType, info.displayName)
          ?: throw IllegalStateException("Could not create the destination file")
        try {
          copyContent(sourceUri, created)
        } catch (e: Exception) {
          try {
            DocumentsContract.deleteDocument(resolver, created)
          } catch (cleanupError: Exception) {
            // 반쪽 사본을 지우지 못해도 원래 오류를 알리는 것이 우선이다.
          }
          throw e
        }
        absolutePathOf(DocumentsContract.getDocumentId(created))?.let { scanPaths.add(it) }
        results.add(result(source, ok = true, skipped = false, error = null))
      } catch (e: Exception) {
        results.add(result(source, ok = false, skipped = false, error = e.message ?: e.javaClass.simpleName))
      }
    }
    // SAF로 쓴 파일이 MediaStore에 곧바로 잡히도록 스캔한다(이미 잡혔다면 아무 일도 하지 않는다).
    if (scanPaths.isNotEmpty()) scanFiles(scanPaths)
    return results
  }

  private fun result(source: String, ok: Boolean, skipped: Boolean, error: String?): Map<String, Any?> =
    mapOf("source" to source, "ok" to ok, "skipped" to skipped, "error" to error)

  // treeDocId 아래로 destinationDocId까지 한 단계씩 내려가며 없는 폴더를 만든다. 돌려주는 값은 대상 폴더의 문서 URI.
  private fun ensureDirectory(treeUri: Uri, treeDocId: String, destinationDocId: String): Uri {
    require(destinationDocId == treeDocId || destinationDocId.startsWith("$treeDocId/")) {
      "Destination is outside the granted folder"
    }
    var currentDocId = treeDocId
    var currentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeDocId)
    val rest = destinationDocId.removePrefix(treeDocId).trim('/')
    if (rest.isEmpty()) return currentUri
    for (segment in rest.split('/')) {
      val existing = findChildDirectory(treeUri, currentDocId, segment)
      currentUri = existing
        ?: DocumentsContract.createDocument(
          context.contentResolver,
          currentUri,
          DocumentsContract.Document.MIME_TYPE_DIR,
          segment
        )
        ?: throw IllegalStateException("Could not create folder: $segment")
      currentDocId = DocumentsContract.getDocumentId(currentUri)
    }
    return currentUri
  }

  private fun findChildDirectory(treeUri: Uri, parentDocId: String, name: String): Uri? {
    val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
    val projection = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE
    )
    context.contentResolver.query(childrenUri, projection, null, null, null)?.use { cursor ->
      while (cursor.moveToNext()) {
        val isDirectory = cursor.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR
        if (isDirectory && cursor.getString(1).equals(name, ignoreCase = true)) {
          return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(0))
        }
      }
    }
    return null
  }

  private class SourceInfo(val displayName: String, val mimeType: String, val relativePath: String?)

  private fun querySource(uri: Uri): SourceInfo {
    val projection = arrayOf(
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.RELATIVE_PATH
    )
    context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        val name = cursor.getString(0) ?: uri.lastPathSegment ?: "file"
        val mime = cursor.getString(1) ?: "application/octet-stream"
        return SourceInfo(name, mime, cursor.getString(2))
      }
    }
    throw IllegalStateException("Source not found: $uri")
  }

  private fun copyContent(source: Uri, target: Uri) {
    val resolver = context.contentResolver
    val expected = resolver.openFileDescriptor(source, "r")?.use { it.statSize } ?: -1L
    val input = resolver.openInputStream(source) ?: throw IllegalStateException("Could not open the source file")
    val copied = input.use { stream ->
      val output = resolver.openOutputStream(target, "w") ?: throw IllegalStateException("Could not open the destination file")
      output.use { stream.copyTo(it) }
    }
    check(expected < 0 || copied == expected) { "Copied file size does not match" }
  }

  // `primary:_MyData/Photo` → `_MyData/Photo/` (MediaStore RELATIVE_PATH 형식)
  private fun relativePathOf(docId: String): String {
    val path = docId.substringAfter(':', "").trim('/')
    return if (path.isEmpty()) "" else "$path/"
  }

  private fun sameFolder(a: String, b: String): Boolean =
    a.trim('/').equals(b.trim('/'), ignoreCase = true)

  private fun absolutePathOf(docId: String): String? {
    if (docId.substringBefore(':') != PRIMARY_VOLUME) return null
    @Suppress("DEPRECATION")
    val root = Environment.getExternalStorageDirectory().absolutePath
    return "$root/${docId.substringAfter(':')}"
  }

  private suspend fun scanFiles(paths: List<String>) {
    withTimeoutOrNull(SCAN_TIMEOUT_MS) {
      suspendCancellableCoroutine<Unit> { continuation ->
        val remaining = AtomicInteger(paths.size)
        MediaScannerConnection.scanFile(context, paths.toTypedArray(), null) { _, _ ->
          if (remaining.decrementAndGet() == 0 && continuation.isActive) continuation.resume(Unit)
        }
      }
    }
  }
}

data class TreeInput(val initialDocId: String) : Serializable

private class TreeContract(
  private val appContextProvider: AppContextProvider
) : AppContextActivityResultContract<TreeInput, String?> {
  override fun createIntent(context: Context, input: TreeInput): Intent {
    val initialUri = DocumentsContract.buildDocumentUri(EXTERNAL_STORAGE_AUTHORITY, input.initialDocId)
    return Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUri)
  }

  override fun parseResult(input: TreeInput, resultCode: Int, intent: Intent?): String? {
    val uri = intent?.data
    if (resultCode != Activity.RESULT_OK || uri == null) return null
    val resolver = appContextProvider.appContext.reactContext?.contentResolver
      ?: throw Exceptions.ReactContextLost()
    resolver.takePersistableUriPermission(
      uri,
      Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
    )
    return DocumentsContract.getTreeDocumentId(uri)
  }
}
