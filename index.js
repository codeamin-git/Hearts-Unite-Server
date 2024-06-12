const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const { parse } = require('dotenv')
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)


const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://hearts-unite-e66d8.web.app'],
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
    const db = client.db('heartsUnite')
    const biodatasCollection = db.collection('biodatas');
    const usersCollection = db.collection('users');
    const favBiodatasCollection = db.collection('favBiodatas');
    const contactReqsCollection = db.collection('contactRequests');
    const successStoriesCollection = db.collection('successStories');
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

    // /create-payment-intent
    app.post('/create-payment-intent', verifyToken, async(req, res) => {
      const price = req.body.price
      const priceInCent = parseFloat(price) * 100
      // generate clientSecret
      const {client_secret} = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // send clientSecret as response
      res.send({clientSecret: client_secret})
    })

    // save a user data in db
    app.put('/user', async(req, res) => {
      const user = req.body
      const query = { email: user?.email }
      // check if user is already exist in db
      const isExist = await usersCollection.findOne(query)
      if(isExist){
        if(user.status === 'Requested'){
          // existing user wants to change his role
          const result = await usersCollection.updateOne(query, {$set: {status: user?.status}})
          res.send(result)
        } 
        else {
          // if existing user login again
          return res.send(isExist)
        }
      }

      // for new user
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

    // get a user info by email from usersCollection db
    app.get('/user/:email', async(req, res)=>{
      const email = req.params.email;
      const result = await usersCollection.findOne({email})
      res.send(result)
    })

    // get all users from userCollection
    app.get('/users', async (req, res) => {
      const { username } = req.query;
      let query = {};
      if (username) {
          query.username = { $regex: username, $options: 'i' }; // Case-insensitive search
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
  });

    // update a user role
    app.patch('/users/update/:email', async(req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email }
      const updatedDoc = {
        $set: {
          ...user
        }
      }
      const result = await usersCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    // get all biodatas
    app.get('/biodatas', async (req, res) => {
      const { page = 1, limit = 4 } = req.query;

      const skip = (page -1) * parseInt(limit, 10);
      const totalItems = await biodatasCollection.countDocuments();
      const result = await biodatasCollection.find().skip(skip).limit(parseInt(limit, 10)).toArray();
      res.send({
        biodatas: result,
        total: totalItems
      });
  });

    // get a single biodata by _id
    app.get('/biodata/:id', async(req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await biodatasCollection.findOne(query)
      res.send(result)
    })

    // Get similar biodatas based on biodataType
    app.get('/similarBiodatas', async (req, res) => {
    const { biodataType } = req.query;
    const query = { biodataType: biodataType };
    const similarBiodatas = await biodatasCollection.find(query).limit(3).toArray();
    res.send(similarBiodatas);
    });

    // get biodata by email
    app.get('/viewBiodata/:email', verifyToken, async(req, res) => {
      const email = req.params.email;
      const query = {contactEmail: email}
      const result = await biodatasCollection.find(query).toArray()
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

    // make premium apis
    app.get('/allPremiumReq', async(req, res)=>{
      const query = {biodataStatus: 'Requested'}
      const result = await biodatasCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/allPremiumMember', async(req, res)=>{
      const query = {biodataStatus: 'Premium'}
      const result = await biodatasCollection.find(query).toArray()
      res.send(result)
    })

    app.patch('/biodata/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const updateDoc = {
        $set:{
          biodataStatus: req.body.biodataStatus
        }
      }
      const result = await biodatasCollection.updateOne(query, updateDoc)
      console.log(req.body);
     res.send(result)
    })
    
    app.patch('/makePremium/:id', async(req, res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const updateDoc = {
        $set:{
          biodataStatus: 'Premium'
        }
      }
      const result = await biodatasCollection.updateOne(query, updateDoc)
      res.send(result)
    })

    // favourite biodata collection
    app.get('/favBiodatas', async(req, res) => {
      const result = await favBiodatasCollection.find().toArray();
      res.send(result)
    })

    // add a biodata to favourite biodatas collection
    app.post('/favBiodata', async(req, res) => {
      const biodata = req.body;
      const result = await favBiodatasCollection.insertOne(biodata);
      res.send(result)
    })

    // delete from favourite biodatas collection
    app.delete('/favBiodata/:id', async(req, res) =>{
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await favBiodatasCollection.deleteOne(query);
      res.send(result)
    })

    // contact request endpoints
    app.get('/checkout/:biodataId', async(req, res) => {
      const biodataId = req.params.biodataId;
      const id = parseInt(biodataId)
      const query = {biodataId: id}
      const result = await biodatasCollection.findOne(query)
      res.send(result)
    })

    app.get('/contactReqs', async(req, res)=>{
      const result = await contactReqsCollection.find().toArray()
      res.send(result)
    })

    app.get('/contactReqs/:email', async(req, res)=>{
      const email = req.params.email;
      const query = {requester: email}
      const result = await contactReqsCollection.find(query).toArray()
      res.send(result)
    })

    // add to contactRequests collection
    app.post('/contactReqs', verifyToken, async(req, res) => {
      const biodata = req.body;
      const result = await contactReqsCollection.insertOne(biodata);
      res.send(result)
    })

    // update request status
    app.patch('/contactReqs/:id', async(req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id)}
      const updateDoc = {
        $set: {requestStatus: 'Approved'}
      }
      const result = await contactReqsCollection.updateOne(query, updateDoc);
      res.send(result)
    })

    // delete my contact request
    app.delete('/contactReqs/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await contactReqsCollection.deleteOne(query)
      res.send(result)
    })

    // admin dashboard
    app.get('/admin-stat', async(req, res) => {
      const biodatas = await biodatasCollection.find().toArray();

      const maleBiodata = await biodatasCollection.countDocuments({biodataType: 'Male'});

      const femaleBiodata = await biodatasCollection.countDocuments({biodataType: 'Female'});

      const premiumBiodata = await biodatasCollection.countDocuments({biodataStatus: 'Premium'})

      const revenue = await contactReqsCollection.countDocuments();
      totalRevenue = revenue*5

      const totalMarriage = await successStoriesCollection.countDocuments();

      res.send({totalBiodata: biodatas.length, maleBiodata, femaleBiodata, premiumBiodata, totalRevenue, totalMarriage})
    })

    // success stories collection
    app.get('/success-stories', async(req, res)=>{
      result = await successStoriesCollection.find().toArray()
      res.send(result)
    })

    app.post('/success-stories', async(req, res)=>{
      const story = req.body
      const result = await successStoriesCollection.insertOne(story)
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