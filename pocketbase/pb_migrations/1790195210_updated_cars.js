/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("fjfo2app7fhb5wk")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "fdklon5q",
    "name": "plateNumber",
    "type": "text",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "pattern": ""
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("fjfo2app7fhb5wk")

  // remove
  collection.schema.removeField("fdklon5q")

  return dao.saveCollection(collection)
})
