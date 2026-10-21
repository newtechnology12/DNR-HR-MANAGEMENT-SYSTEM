/// <reference path="../pb_data/types.d.ts" />
/**
 * Supporting documents (rules in lib/attachments.js).
 *
 *   POST   /api/ims/attachments/:collection/:id             multipart "files" (one or more)
 *   DELETE /api/ims/attachments/:collection/:id/:filename   while the document is still being prepared
 */

routerAdd("POST", "/api/ims/attachments/:collection/:id", (c) => {
  const files = require(`${__hooks}/lib/attachments.js`).add(c, c.pathParam("collection"), c.pathParam("id"));
  return c.json(200, { files });
}, $apis.requireAdminOrRecordAuth(), $apis.bodyLimit(110 << 20));

routerAdd("DELETE", "/api/ims/attachments/:collection/:id/:filename", (c) => {
  const files = require(`${__hooks}/lib/attachments.js`).remove(c, c.pathParam("collection"), c.pathParam("id"), c.pathParam("filename"));
  return c.json(200, { files });
}, $apis.requireAdminOrRecordAuth());
