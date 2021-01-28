import { MeiliSearch } from 'meilisearch'

export default async function handler(req, res) {

    const client = new MeiliSearch({
      host: process.env.SEARCH_BASE_URL,
      apiKey: process.env.API_KEY,
    })

    const index = client.index('ism')

    let queryLimit = Number(req.query.queryLimit)
    let searchQuery = req.query.searchQuery
    let searchFilters = req.query.searchFilters

    try{
      const search = await index.search(searchQuery, { limit: queryLimit, filters: searchFilters })
      return res.status(200).json(search)
    }
    catch(err) {
      //TODO: add real logging.
      console.log(err)
      return res.status(500).json({"message": "Failed to get result."})
    }
  }