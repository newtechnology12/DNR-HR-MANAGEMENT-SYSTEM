/// <reference path="../pb_data/types.d.ts" />
/**
 * RALGA IMS — e-mail delivery: the mail server configured in the app (Settings → E-mail) drives
 * PocketBase's mailer (lib/mail.js applies it at start-up and on every change).
 *
 *  - settings.smtp_enabled   switch for sending e-mail (on when a mail server was already filled in)
 *  - settings.app_url        public address of the app, used for the links in e-mails
 */
migrate(
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("settings");
    if (!c.schema.getFieldByName("smtp_enabled")) c.schema.addField(new SchemaField({ name: "smtp_enabled", type: "bool", required: false, options: {} }));
    if (!c.schema.getFieldByName("app_url")) c.schema.addField(new SchemaField({ name: "app_url", type: "text", required: false, options: { min: null, max: null, pattern: "" } }));
    dao.saveCollection(c);
    for (const r of dao.findRecordsByFilter("settings", "id != ''", "", 10, 0) || []) {
      if (r.getString("smtp_host")) {
        r.set("smtp_enabled", true);
        dao.saveRecord(r);
      }
    }
  },
  (db) => {
    const dao = new Dao(db);
    const c = dao.findCollectionByNameOrId("settings");
    for (const name of ["smtp_enabled", "app_url"]) {
      const f = c.schema.getFieldByName(name);
      if (f) c.schema.removeField(f.id);
    }
    dao.saveCollection(c);
  }
);
