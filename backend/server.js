require('dotenv').config();

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Routes
const variableRoutes = require('./routes/variables')
const pollingRoutes = require('./routes/polling')

const cors = require('cors')

// Database
const pool = require('./db')

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api/variables', variableRoutes)
app.use('/api/polling', pollingRoutes)

// Test route
app.get('/health', async (req, res) => {

    let dbRes;
    try {
        const result = await pool.query('SELECT NOW()');
        dbRes = `DB ok: Timestamp = ${result.rows[0].now}`
    } catch (e) {
        dbRes = `DB in errore: ${e}`
    }

    res.json({
        status: 'ok',
        server: `Backend is running`,
        db: `${dbRes}`,
        timestamp: new Date().toISOString()
    })
});



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Test: http://localhost:${PORT}/health`)
});