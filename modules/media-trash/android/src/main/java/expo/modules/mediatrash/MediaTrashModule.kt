package expo.modules.mediatrash

import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.ACTION_INTENT_SENDER_REQUEST
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult.Companion.EXTRA_INTENT_SENDER_REQUEST
import androidx.annotation.RequiresApi
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.providers.AppContextProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.Serializable

/**
 * MediaStore 휴지통(Android 11+). expo-media-library에는 휴지통 API가 없어 직접 만든다.
 *
 * - 휴지통으로 보내기/복원: `MediaStore.createTrashRequest`(시스템 확인 다이얼로그)
 * - 영구 삭제: `MediaStore.createDeleteRequest`(시스템 확인 다이얼로그)
 * - 휴지통 목록: `QUERY_ARG_MATCH_TRASHED = MATCH_ONLY` 질의. 휴지통 항목은 일반 질의(앨범 조회 등)에서 자동으로
 *   빠지므로, 보내기만 하면 기존 갤러리 화면은 그대로 항목이 사라진 것으로 보인다. 보관 기간(약 30일)이 지나면
 *   OS가 알아서 지운다(`DATE_EXPIRES`).
 *
 * 쓰기 승인은 expo-media-library와 같은 방식으로 Activity 결과 계약을 등록해 받는다.
 */
class MediaTrashModule : Module() {
  private lateinit var trashLauncher: AppContextActivityResultLauncher<TrashInput, Boolean>
  private lateinit var deleteLauncher: AppContextActivityResultLauncher<DeleteInput, Boolean>

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MediaTrash")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    /** trashed=true면 휴지통으로, false면 복원. 사용자가 승인하면 true, 취소하면 false. */
    AsyncFunction("setTrashed") Coroutine { uris: List<Uri>, trashed: Boolean ->
      if (uris.isEmpty()) return@Coroutine true
      trashLauncher.launch(TrashInput(uris, trashed))
    }

    AsyncFunction("deletePermanently") Coroutine { uris: List<Uri> ->
      if (uris.isEmpty()) return@Coroutine true
      deleteLauncher.launch(DeleteInput(uris))
    }

    AsyncFunction("listTrashed") Coroutine { ->
      withContext(Dispatchers.IO) { queryTrashed() }
    }

    RegisterActivityContracts {
      trashLauncher = registerForActivityResult(TrashContract(this@MediaTrashModule))
      deleteLauncher = registerForActivityResult(DeleteContract(this@MediaTrashModule))
    }
  }

  @RequiresApi(Build.VERSION_CODES.R)
  private fun queryTrashed(): List<Map<String, Any?>> {
    val resolver = context.contentResolver
    val projection = arrayOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
      MediaStore.Files.FileColumns.DATE_TAKEN,
      MediaStore.Files.FileColumns.DATE_MODIFIED,
      MediaStore.Files.FileColumns.DATE_EXPIRES,
      MediaStore.Files.FileColumns.SIZE,
      MediaStore.Files.FileColumns.RELATIVE_PATH
    )
    val args = Bundle().apply {
      putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_ONLY)
      putString(
        ContentResolver.QUERY_ARG_SQL_SELECTION,
        "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"
      )
      putStringArray(
        ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
        arrayOf(
          MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
          MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString()
        )
      )
      // 곧 지워질 것부터 보여준다.
      putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Files.FileColumns.DATE_EXPIRES))
      putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_ASCENDING)
    }

    val items = mutableListOf<Map<String, Any?>>()
    resolver.query(MediaStore.Files.getContentUri("external"), projection, args, null)?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
      val nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
      val typeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
      val takenColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_TAKEN)
      val modifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
      val expiresColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_EXPIRES)
      val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.SIZE)
      val pathColumn = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.RELATIVE_PATH)
      while (cursor.moveToNext()) {
        val isVideo = cursor.getInt(typeColumn) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
        // expo-media-library의 asset id와 같은 형태(컬렉션별 content URI)로 돌려줘야 앱의 다른 곳과 맞는다.
        val collection = if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        items.add(
          mapOf(
            "id" to ContentUris.withAppendedId(collection, cursor.getLong(idColumn)).toString(),
            "filename" to cursor.getString(nameColumn),
            "isVideo" to isVideo,
            "takenAt" to if (cursor.isNull(takenColumn)) null else cursor.getLong(takenColumn),
            "modifiedAt" to if (cursor.isNull(modifiedColumn)) null else cursor.getLong(modifiedColumn) * 1000,
            "expiresAt" to if (cursor.isNull(expiresColumn)) null else cursor.getLong(expiresColumn) * 1000,
            "size" to cursor.getLong(sizeColumn),
            "relativePath" to cursor.getString(pathColumn)
          )
        )
      }
    }
    return items
  }
}

data class TrashInput(val uris: List<Uri>, val trashed: Boolean) : Serializable

data class DeleteInput(val uris: List<Uri>) : Serializable

private class TrashContract(
  private val appContextProvider: AppContextProvider
) : AppContextActivityResultContract<TrashInput, Boolean> {
  @RequiresApi(Build.VERSION_CODES.R)
  override fun createIntent(context: Context, input: TrashInput): Intent {
    val resolver = appContextProvider.appContext.reactContext?.contentResolver
      ?: throw Exceptions.ReactContextLost()
    val request = MediaStore.createTrashRequest(resolver, input.uris, input.trashed)
    val intentSenderRequest = IntentSenderRequest.Builder(request.intentSender).build()
    return Intent(ACTION_INTENT_SENDER_REQUEST).putExtra(EXTRA_INTENT_SENDER_REQUEST, intentSenderRequest)
  }

  override fun parseResult(input: TrashInput, resultCode: Int, intent: Intent?): Boolean =
    resultCode == Activity.RESULT_OK
}

private class DeleteContract(
  private val appContextProvider: AppContextProvider
) : AppContextActivityResultContract<DeleteInput, Boolean> {
  @RequiresApi(Build.VERSION_CODES.R)
  override fun createIntent(context: Context, input: DeleteInput): Intent {
    val resolver = appContextProvider.appContext.reactContext?.contentResolver
      ?: throw Exceptions.ReactContextLost()
    val request = MediaStore.createDeleteRequest(resolver, input.uris)
    val intentSenderRequest = IntentSenderRequest.Builder(request.intentSender).build()
    return Intent(ACTION_INTENT_SENDER_REQUEST).putExtra(EXTRA_INTENT_SENDER_REQUEST, intentSenderRequest)
  }

  override fun parseResult(input: DeleteInput, resultCode: Int, intent: Intent?): Boolean =
    resultCode == Activity.RESULT_OK
}
