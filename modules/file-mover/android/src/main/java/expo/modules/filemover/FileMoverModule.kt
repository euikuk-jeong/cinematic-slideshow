package expo.modules.filemover

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume

private const val SCAN_TIMEOUT_MS = 15_000L

/**
 * 사진·영상을 MediaStore의 RELATIVE_PATH 변경이 아니라 파일 시스템에서 직접 옮기거나 복사한다.
 *
 * MediaStore는 사진·영상의 최상위 폴더를 DCIM/Pictures/Movies로 제한해(`Primary directory X not allowed`)
 * 그 밖의 폴더(예: /storage/emulated/0/_MyData/...)로는 RELATIVE_PATH를 바꿀 수 없다. 그 폴더로 옮기려면
 * `MANAGE_EXTERNAL_STORAGE`(모든 파일 접근)로 파일을 직접 쓰고 MediaStore를 다시 스캔해야 한다.
 * 이 모듈은 그 경로만 담당하며, 호출하는 쪽(JS)이 권한 안내와 "거부된 대상에만 사용"을 책임진다.
 */
class FileMoverModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FileMover")

    // 매니페스트에 선언돼 있는가. 선언을 뺀 빌드(예: Play 심사용)에서는 설정 화면에 허용 항목 자체가 없어
    // 사용자를 막다른 길로 보내게 되므로, JS가 이 값으로 직접 이동 UI를 통째로 끈다.
    Function("isAllFilesAccessDeclared") {
      isAllFilesAccessDeclared()
    }

    Function("isAllFilesAccessGranted") {
      hasAllFilesAccess()
    }

    Function("openAllFilesAccessSettings") {
      openAllFilesAccessSettings()
    }

    AsyncFunction("transferFiles") Coroutine { sources: List<String>, destinationDir: String, move: Boolean ->
      withContext(Dispatchers.IO) { transfer(sources, destinationDir, move) }
    }
  }

  private fun isAllFilesAccessDeclared(): Boolean =
    try {
      val packageManager = context.packageManager
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
        )
      } else {
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
      }
      info.requestedPermissions?.contains("android.permission.MANAGE_EXTERNAL_STORAGE") == true
    } catch (e: Exception) {
      false
    }

  private fun hasAllFilesAccess(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()

  private fun openAllFilesAccessSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val host = appContext.currentActivity ?: context
    val packageUri = Uri.parse("package:${context.packageName}")
    val appIntent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri)
    val listIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
    for (intent in listOf(appIntent, listIntent)) {
      if (host !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        host.startActivity(intent)
        return
      } catch (e: ActivityNotFoundException) {
        // 기기에 앱별 화면이 없으면 전체 목록 화면으로 한 번 더 시도한다.
      }
    }
  }

  private suspend fun transfer(
    sources: List<String>,
    destinationDir: String,
    move: Boolean
  ): List<Map<String, Any?>> {
    check(hasAllFilesAccess()) { "All files access is not granted" }
    val destination = File(destinationDir)
    validateDestination(destination)
    if (!destination.isDirectory && !destination.mkdirs()) {
      throw IllegalStateException("Could not create destination folder: $destinationDir")
    }

    val results = mutableListOf<Map<String, Any?>>()
    val scanPaths = mutableListOf<String>()
    for (sourcePath in sources) {
      val source = File(sourcePath)
      try {
        check(source.isFile) { "Source file not found: $sourcePath" }
        if (move && source.absoluteFile.parentFile?.canonicalPath == destination.canonicalPath) {
          // 이미 그 폴더에 있다 — 옮길 것이 없다.
          results.add(result(sourcePath, source.absolutePath, null))
          continue
        }
        val target = uniqueTarget(destination, source.name)
        if (move) moveFile(source, target) else copyFile(source, target)
        scanPaths.add(target.absolutePath)
        if (move) {
          removeFromMediaStore(source.absolutePath)
          scanPaths.add(source.absolutePath)
        }
        results.add(result(sourcePath, target.absolutePath, null))
      } catch (e: Exception) {
        results.add(result(sourcePath, null, e.message ?: e.javaClass.simpleName))
      }
    }
    if (scanPaths.isNotEmpty()) scanFiles(scanPaths)
    return results
  }

  private fun result(source: String, destination: String?, error: String?): Map<String, Any?> =
    mapOf("source" to source, "destination" to destination, "ok" to (error == null), "error" to error)

  // 외부 저장소 안이어야 하고, 앱 전용 영역(Android/data, Android/obb)은 모든 파일 접근으로도 쓸 수 없다.
  private fun validateDestination(destination: File) {
    val root = Environment.getExternalStorageDirectory().canonicalFile
    val canonical = destination.canonicalFile
    require(canonical.path.startsWith(root.path + "/")) { "Destination must be inside external storage" }
    val segments = canonical.path.removePrefix(root.path + "/").split('/')
    val restricted = segments.size >= 2 &&
      segments[0].equals("Android", ignoreCase = true) &&
      (segments[1].equals("data", ignoreCase = true) || segments[1].equals("obb", ignoreCase = true))
    require(!restricted) { "Destination is a restricted app folder" }
  }

  private fun uniqueTarget(directory: File, name: String): File {
    var candidate = File(directory, name)
    if (!candidate.exists()) return candidate
    val base = if (name.contains('.')) name.substringBeforeLast('.') else name
    val extension = if (name.contains('.')) ".${name.substringAfterLast('.')}" else ""
    var index = 1
    while (true) {
      candidate = File(directory, "$base ($index)$extension")
      if (!candidate.exists()) return candidate
      index++
    }
  }

  private fun moveFile(source: File, target: File) {
    if (source.renameTo(target)) return
    // 다른 볼륨 등으로 rename이 안 되면 복사 후 원본 삭제. 원본을 못 지우면 중복이 남지 않게 복사본을 되돌린다.
    copyFile(source, target)
    if (!source.delete()) {
      target.delete()
      throw IllegalStateException("Could not remove the original file after copying")
    }
  }

  private fun copyFile(source: File, target: File) {
    try {
      source.inputStream().use { input -> target.outputStream().use { output -> input.copyTo(output) } }
      check(target.length() == source.length()) { "Copied file size does not match" }
      target.setLastModified(source.lastModified())
    } catch (e: Exception) {
      target.delete()
      throw e
    }
  }

  // 파일이 사라진 옛 항목이 앨범에 유령으로 남지 않게 지운다. 실패해도 아래 스캔이 한 번 더 정리를 시도한다.
  private fun removeFromMediaStore(path: String) {
    try {
      context.contentResolver.delete(
        MediaStore.Files.getContentUri("external"),
        "${MediaStore.MediaColumns.DATA}=?",
        arrayOf(path)
      )
    } catch (e: Exception) {
      // best effort
    }
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
