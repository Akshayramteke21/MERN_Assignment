
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());


const uri = process.env.MONGODB_URI;
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.log(err));


const productSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  dateOfSale: Date,
  sold: Boolean,
  category: String
});

const Product = mongoose.model('Product', productSchema);


app.get('/initialize', async (req, res) => {
  try {
    const response = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    await Product.deleteMany({});
    await Product.insertMany(response.data);
    res.status(200).send('Database initialized');
  } catch (error) {
    res.status(500).send('Error initializing database');
  }
});


app.get('/transactions', async (req, res) => {
  const { page = 1, perPage = 10, search = '', month } = req.query;
  let query = {};

  if (month) {
    query.dateOfSale = { $regex: new RegExp(`-${month.padStart(2, '0')}-`) };
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { price: { $regex: search, $options: 'i' } }
    ];
  }

  try {
    const products = await Product.find(query)
      .skip((page - 1) * perPage)
      .limit(parseInt(perPage));
    const total = await Product.countDocuments(query);
    res.status(200).json({ products, total });
  } catch (error) {
    res.status(500).send('Error fetching transactions');
  }
});


app.get('/statistics', async (req, res) => {
  const { month } = req.query;
  let query = {};

  if (month) {
    query.dateOfSale = { $regex: new RegExp(`-${month.padStart(2, '0')}-`) };
  }

  try {
    const totalSaleAmount = await Product.aggregate([
      { $match: query },
      { $group: { _id: null, totalSaleAmount: { $sum: "$price" } } }
    ]);

    const totalSoldItems = await Product.countDocuments({ ...query, sold: true });
    const totalNotSoldItems = await Product.countDocuments({ ...query, sold: false });

    res.status(200).json({
      totalSaleAmount: totalSaleAmount.length > 0 ? totalSaleAmount[0].totalSaleAmount : 0,
      totalSoldItems,
      totalNotSoldItems
    });
  } catch (error) {
    res.status(500).send('Error fetching statistics');
  }
});


app.get('/bar-chart', async (req, res) => {
  const { month } = req.query;
  let query = {};

  if (month) {
    query.dateOfSale = { $regex: new RegExp(`-${month.padStart(2, '0')}-`) };
  }

  try {
    const data = await Product.aggregate([
      { $match: query },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
          default: "Other",
          output: {
            count: { $sum: 1 }
          }
        }
      }
    ]);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).send('Error fetching bar chart data');
  }
});


app.get('/pie-chart', async (req, res) => {
  const { month } = req.query;
  let query = {};

  if (month) {
    query.dateOfSale = { $regex: new RegExp(`-${month.padStart(2, '0')}-`) };
  }

  try {
    const data = await Product.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).send('Error fetching pie chart data');
  }
});


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
