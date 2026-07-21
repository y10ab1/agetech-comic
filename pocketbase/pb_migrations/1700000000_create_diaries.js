/// <reference path="../pb_data/types.d.ts" />
// 日記 collection schema（版控於此，serve 時自動套用）
// 見 docs/api-contract-additions.md §3：user_id、created_at、title、tags、mood、style、cover(圖檔)、logline
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "diaries",
      fields: [
        { type: "text", name: "user_id", required: true, max: 128 },
        { type: "text", name: "title", required: false, max: 200 },
        // tags 以逗號分隔字串儲存（限定 taxonomy，見 shared/tags.json）
        { type: "text", name: "tags", required: false, max: 500 },
        { type: "select", name: "mood", maxSelect: 1, values: ["happy", "calm", "tired"] },
        { type: "text", name: "style", required: false, max: 50 },
        { type: "text", name: "logline", required: false, max: 1000 },
        { type: "text", name: "created_at", required: false, max: 40 },
        {
          type: "file",
          name: "comic",
          maxSelect: 1,
          maxSize: 10485760,
          mimeTypes: ["image/png", "image/jpeg", "image/webp"],
        },
      ],
      // 全部鎖起來：只有後端以 superuser 存取（superuser bypass rules）
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      indexes: ["CREATE INDEX idx_diaries_user ON diaries (user_id)"],
    });
    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("diaries"));
  },
);
