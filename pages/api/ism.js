import { MeiliSearch } from 'meilisearch'
import Cors from 'cors'
import initMiddleware from '../../lib/init-middleware'
import * as admin from "firebase-admin";

const cors = initMiddleware(
  Cors({
    methods: ['GET'],
    origin: `${process.env.CORS_DOMAIN ?? 'http://localhost:3000'}`
  })
)

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.PROJECT_ID,
        privateKey: process.env.PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.CLIENT_EMAIL,
    })
  });
}

/*
  Helper function to record search queries for analytics.
*/
const recordSearchResult = async (text) => {
  try {
    await admin
            .firestore()
            .collection('recorded-searches')
            .add({searchedText:text, searchTime:new Date()})
  } catch (err) {
    // TODO: add real logging
    console.log(err)
  }
}

export default async function handler(req, res) {

  await cors(req, res)

  const client = new MeiliSearch({
    host: process.env.SEARCH_BASE_URL,
    apiKey: process.env.API_KEY,
  })

  const index = client.index('ism-sep-2021')

  let queryLimit = Number(req.query.queryLimit)
  let searchQuery = req.query.searchQuery
  let searchFilters = req.query.searchFilters

  try {
    // log search result
    await recordSearchResult(searchQuery)
    const search = await index.search(searchQuery, { limit: queryLimit, filters: searchFilters })
    return res.status(200).json(search)
  }
  catch (err) {
    //TODO: add real logging.
    console.log(err)
    return res.status(500).json({ "message": "Failed to get result." })
  }
}