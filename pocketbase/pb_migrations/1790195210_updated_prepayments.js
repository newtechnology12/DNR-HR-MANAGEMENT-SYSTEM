/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9rqroaq8x2kpm7s")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "pwzvpegd",
    "name": "payroll",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "cbygihkui8nc08y",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9rqroaq8x2kpm7s")

  // remove
  collection.schema.removeField("pwzvpegd")

  return dao.saveCollection(collection)
})
