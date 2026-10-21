/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("9tqt8rd4vostoe4")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "bbrremah",
    "name": "permitions",
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
  const collection = dao.findCollectionByNameOrId("9tqt8rd4vostoe4")

  // remove
  collection.schema.removeField("bbrremah")

  return dao.saveCollection(collection)
})
