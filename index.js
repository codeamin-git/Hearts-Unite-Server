const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zyujvjv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    // collections
    const biodatasCollection = client.db('heartsUnite').collection('biodatas');
    const usersCollection = client.db('heartsUnite').collection('users')
    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // save a user data in db
    app.put('/user', async(req, res) => {
      const user = req.body
      const query = { email: user?.email }
      // check if user is already exist in db
      const isExist = await usersCollection.findOne(query)
      if(isExist) return res.send(isExist)


      const options = { upsert: true}
      const updatedDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        }
      }
      const result = await usersCollection.updateOne(query, updatedDoc, options);
      res.send(result);
    })

    // get all users from userCollection
    app.get('/users', async(req, res) => {
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    // get all biodatas
    app.get('/biodatas', async (req, res) => {
      const result = await biodatasCollection.find().toArray();
      res.send(result);
  });

    // get a single biodata by _id
    app.get('/biodata/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await biodatasCollection.findOne(query)
      res.send(result)
    })

    // add a biodata
    app.post('/biodata', async(req, res) => {
      const biodata = req.body;
      const totalBiodatas = await biodatasCollection.countDocuments();
      const nextBiodataId = totalBiodatas + 1;
      biodata.biodataId = nextBiodataId;
      const result = await biodatasCollection.insertOne(biodata)
      res.send(result)
    })

    // get biodata by email
    app.get('/viewBiodata/:email', async(req, res) => {
      const email = req.params.email;
      const query = {contactEmail: email}
      const result = await biodatasCollection.find(query).toArray()
      res.send(result)
    })
    







    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from HeartUnite Server..')
})

app.listen(port, () => {
  console.log(`HeartsUnite is running on port ${port}`)
})