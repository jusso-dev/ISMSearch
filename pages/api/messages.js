import Cors from 'cors'
import initMiddleware from '../../lib/init-middleware'

const cors = initMiddleware(
  Cors({
    methods: ['GET'],
    origin: `${process.env.CORS_DOMAIN ?? 'http://localhost:3000'}`
  })
)

export default async function handler(req, res) {

    await cors(req, res)

    try{
      let result = await fetch(`${process.env.MESSAGE_BASE_URL}/messages/1`)
      let json = await result.json()
      return res.status(200).json(json)
    }
    catch(err) {
      //TODO: add real logging.
      console.log(err)
      return res.status(500).json({"message": "Failed to get announcement message."})
    }
  }