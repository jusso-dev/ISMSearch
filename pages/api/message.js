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

export default async function handler(req, res) {

    await cors(req, res)

    try{

      const result = await admin
            .firestore()
            .collection('announcement')
            .doc('mmTwBjaMZrmC35HEbA7A')
            .get()

      //let result = await fetch(`${process.env.MESSAGE_BASE_URL}/messages/1`)
      let json = await result.data()
      return res.status(200).json(json)
    }
    catch(err) {
      //TODO: add real logging.
      console.log(err)
      return res.status(500).json({"message": "Failed to get announcement message."})
    }
  }