/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("p9atmwvjdh0etpt")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2ikqisis",
    "name": "payslips",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "cbygihkui8nc08y",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 999,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("p9atmwvjdh0etpt")

  // remove
  collection.schema.removeField("2ikqisis")

  return dao.saveCollection(collection)
})
