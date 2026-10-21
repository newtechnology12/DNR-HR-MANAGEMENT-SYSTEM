/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1xr3ctulengyp5q")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "a4stnhbw",
    "name": "expense",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "9rqroaq8x2kpm7s",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("1xr3ctulengyp5q")

  // remove
  collection.schema.removeField("a4stnhbw")

  return dao.saveCollection(collection)
})
