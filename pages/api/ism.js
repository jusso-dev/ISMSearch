export default async function handler(req, res) {

    let queryLimit = req.query.queryLimit
    let searchQuery = req.query.searchQuery

    let result = await fetch(`${process.env.SEARCH_BASE_URL}q=${searchQuery}&limit=${queryLimit}`, {
      headers: {
        "X-Meili-API-Key": process.env.API_KEY
      }
    })
    try {
        let json = await result.json()
        res.status(200).json(json)
    } catch(err) {
        //TODO: log better error/log to an actual logging backend
        console.error(err)
    }
  }