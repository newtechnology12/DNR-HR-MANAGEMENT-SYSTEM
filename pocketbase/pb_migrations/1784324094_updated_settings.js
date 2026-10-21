/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("k2pppi3dnwh514v")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ugvry4zm",
    "name": "working_days",
    "type": "json",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "maxSize": 2000000
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("k2pppi3dnwh514v")

  // remove
  collection.schema.removeField("ugvry4zm")

  return dao.saveCollection(collection)
})
