/// <reference path="../pb_data/types.d.ts" />
// 增量 migration（issue #9）：diaries 預留旁白音檔與原始旁白文字。
// 不修改已套用的 1700000000_create_diaries.js——既有 DB 不會重跑舊 migration。
// 兩欄皆可空：既有日記升級後原資料保留，新欄位為空值。
//
// - narration：生成當下的完整旁白文字（跨裝置回顧「當天旁白」的資料來源）
// - narration_audio：後端 TTS 旁白音檔（LIFF WebView 無 speechSynthesis／台語旁白用）。
//   第一版單一欄位；若之後有多語音版本再拆獨立 audio collection 關聯回 diary。
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("diaries");
    collection.fields.add(
      new TextField({ name: "narration", required: false, max: 5000 }),
    );
    collection.fields.add(
      new FileField({
        name: "narration_audio",
        required: false,
        maxSelect: 1,
        maxSize: 20971520, // 20MB
        // PocketBase 以內容嗅探判斷 MIME，同格式常見別名一併放行
        mimeTypes: [
          "audio/mpeg",
          "audio/mp4",
          "audio/x-m4a",
          "audio/aac",
          "audio/x-aac",
          "audio/wav",
          "audio/x-wav",
          "audio/ogg",
          "audio/webm",
        ],
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("diaries");
    collection.fields.removeByName("narration_audio");
    collection.fields.removeByName("narration");
    app.save(collection);
  },
);
