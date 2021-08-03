import { MeiliSearch } from 'meilisearch'
import Cors from 'cors'
import initMiddleware from '../../lib/init-middleware'

const cors = initMiddleware(
  Cors({
    methods: ['GET'],
    origin: `${process.env.CORS_DOMAIN ?? 'http://localhost:3000'}`
  })
)



/*
  Helper function to record search queries for analytics.
*/
const recordSearchResult = async (text) => {
  try {
    let baseUrl = process.env.RECORD_SEARCH_BASE_URL

    let jwt = await fetch(baseUrl + "/auth/local", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
          {
            identifier: process.env.STRAPI_USERNAME,
            password: process.env.STRAPI_PASSWORD
          }
        )
    })

    if (!jwt.ok) {
      // TODO: add real logging
      console.log("Failed to get JWT.")
      // no point continuing
      return;
    }

    let content = await jwt.json()

    let searchResult = await fetch(baseUrl + "/search-results", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${content.jwt}`
      },
      body: JSON.stringify({ searchedText: text }),
    })

    if (!searchResult.ok) {
      // TODO: add real logging
      console.log("Failed to save searched text.")
    }
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

  const index = client.index('ism')

  let queryLimit = Number(req.query.queryLimit)
  let searchQuery = req.query.searchQuery
  let searchFilters = req.query.searchFilters

  try {
    // log search result+
    console.log("Feature toggle value was: " + process.env.FEATURE_TOGGLE_LOG_SEARCHES)
    if (process.env.FEATURE_TOGGLE_LOG_SEARCHES === 'true') {
      await recordSearchResult(searchQuery)
    }
    const search = await index.search(searchQuery, { limit: queryLimit, filters: searchFilters })
    return res.status(200).json(search)
  }
  catch (err) {
    //TODO: add real logging.
    console.log(err)
    return res.status(500).json({ "message": "Failed to get result." })
  }
}