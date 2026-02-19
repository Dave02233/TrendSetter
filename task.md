# Riassunto Progetto: Sistema PLC Siemens → TimescaleDB con React

## Obiettivo

Applicazione Docker Compose per acquisizione dati da PLC Siemens S7, configurazione dinamica variabili via web UI, storage su TimescaleDB con visualizzazione realtime/storica.

## Architettura Stack

- **Frontend**: React (configurazione variabili + visualizzazione trend)
- **Backend**: Node.js + Express + nodes7 (comunicazione S7)
- **Database**: PostgreSQL + TimescaleDB (timeseries storage)
- **Deploy**: Docker Compose (3 container)

## Database Schema

### Tabella plc_config
- `id` SERIAL PRIMARY KEY
- `ip` VARCHAR NOT NULL
- `rack` INTEGER NOT NULL
- `slot` INTEGER NOT NULL
- **Default values**: ('192.168.0.10', 0, 1)

### Tabella config
- `id` SERIAL PRIMARY KEY (auto-generato)
- `name` VARCHAR NOT NULL (es. "Temperatura1")
- `address` VARCHAR NOT NULL (es. "DB10,REAL0", "DB10,X2.0")
- `data_type` VARCHAR NOT NULL ("Int", "Bool", "Real")
- `sampling_interval` INTEGER NOT NULL (millisecondi: 500, 1000, 5000)

### Tabella data (TimescaleDB hypertable)
- `timestamp` TIMESTAMPTZ (hypertable partition key)
- `sensor_id` INTEGER NOT NULL (FK → config.id **ON DELETE CASCADE**)
- `value` NUMERIC (Bool convertiti a 0/1)

**Note**: CASCADE delete configurato - eliminando variabile da config si eliminano automaticamente tutti i dati correlati.

## Struttura Directory Backend (Stato Attuale)

```
backend/
├── package.json         ✅ (express, pg, cors, dotenv, nodes7, ws)
├── .env                 ✅ (PORT, DB_*, PLC_*, WS_PORT)
├── server.js            ✅ (entry point, /health migliorato)
├── db/
│   ├── index.js         ✅ (pg Pool singleton)
│   └── sql/
│       └── init.sql     ✅ (spostato qui da backend root)
├── routes/
│   ├── variables.js     ✅ (CRUD completo + validazione rafforzata)
│   └── polling.js       ⚠️  (stub incompleto - DA COMPLETARE)
└── services/
    ├── s7/
    │   ├── s7Service.js ✅ (classe S7Service con connect/disconnect/read)
    │   └── test.js      ✅ (script test connessione manuale S7)
    ├── polling/
    │   └── pollingManager.js ⚠️ (classe base creata, INSERT DB mancante)
    └── opcua/
        └── opcUaService.js  📋 (placeholder TODO)
```

## Funzionalità Backend Implementate

### API REST - Variables ✅

```javascript
GET    /api/variables          - Lista tutte le variabili configurate
POST   /api/variables          - Aggiungi nuova variabile (con validazione intervalli)
DELETE /api/variables/:id      - Rimuovi variabile (CASCADE delete su data)
POST   /api/variables/apply    - TRUNCATE config + INSERT bulk + restart polling
```

**Dettagli implementazione aggiornati**:
- **GET /**: Query `SELECT * FROM config`
- **POST /**: INSERT con validazione rafforzata: check tipi (`typeof`), check `validIntervals = [500, 1000, 5000]`
- **DELETE /:id**: DELETE con RETURNING *, gestione 404, CASCADE automatico su tabella data
- **POST /apply**: Transaction con TRUNCATE RESTART IDENTITY CASCADE + INSERT bulk + rollback su errore, con `client.release()` in finally block
- ⚠️ **PUT /:id** (modifica singola variabile): **NON implementato** — era nel task originale ma manca ancora

### API REST - PLC ❌ (rimossa/non montata)

La route `plc.js` non esiste più nella directory `routes/` e **non è montata** in `server.js`.
Il file `server.js` monta solo `variableRoutes` su `/api/variables`.
La configurazione PLC è gestita solo via `.env` (PLC_IP, PLC_RACK, PLC_SLOT, PLC_PORT).

### API REST - Polling ⚠️ (stub incompleto)

```javascript
POST   /api/polling/start      - Avvia polling (logica incompleta)
```

Il file `routes/polling.js` è presente ma ha bug:
- `pool.query(...).rows[0]` senza `await` (non funziona)
- Istanza `new pollingManager` con nome che collide con il `require`
- Manca la risposta `res.json(...)` alla route
- **Non è montata** in `server.js`

### Health Check ✅ (migliorato)

```javascript
GET    /health                  - Status server + test connessione DB
```

Risponde con: `{ status, server, db: "DB ok: Timestamp = ...", timestamp }`

### S7Service ✅ (implementato)

Classe `S7Service` in `services/s7/s7Service.js`:
- `connect(ip, port, rack, slot, addresses)` — connessione PLC + addItems
- `disconnect()` — dropConnection
- `reconnect(ip, port, rack, slot, addresses)` — disconnect + connect
- `readVariables()` — readAllItems (Promise-based)
- Fix: `removeItems()` chiamato prima di `addItems` per evitare duplicati
- Script `test.js` per test manuale connessione

### PollingManager ⚠️ (struttura base, incompleto)

Classe `pollingManager` in `services/polling/pollingManager.js`:
- Constructor con `ip, port, rack, slot`
- Metodo `start(variables, subscriber)`:
  - Estrae addresses e samplingTimes unici dalle variabili
  - Connette S7Service
  - Crea `setInterval` per ogni samplingTime unico
  - ❌ **BUG**: `await fetch()` senza argomenti al posto dell'INSERT su DB
  - ❌ Il subscriber/callback non è utilizzato
- Metodo `stop()` — clearInterval + disconnect
- Getter `status` — ritorna stato corrente
- **Formato variabili atteso**: `{ 'NomeVar': { address: 'DB10,REAL0', samplingTime: 1000 } }`

### Dipendenze installate ✅

```json
{
  "dependencies": {
    "cors": "^2.8.6",
    "dotenv": "^17.3.1",
    "express": "^5.2.1",
    "nodes7": "^0.3.18",
    "pg": "^8.18.0",
    "ws": "^8.19.0"
  }
}
```

Nota: `ws` (WebSocket) già installato ma non ancora utilizzato.

### Variabili d'Ambiente ✅ (aggiornate)

```env
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=admin
DB_PASSWORD=admin
PLC_IP=192.168.0.10
PLC_RACK=0
PLC_SLOT=1
PLC_PORT=102
WS_PORT=3002
```

Rispetto al task originale: aggiunto `NODE_ENV`, `PLC_PORT=102`, `WS_PORT=3002`.
DB_NAME cambiato da `plc_data` → `postgres`, credenziali da `postgres/postgres` → `admin/admin`.

## Pattern e Best Practices Adottati

### Gestione Errori
- Try-catch in tutte le route async
- Status code appropriati: 200, 201, 400, 404, 500
- Response JSON consistente: `{ message: '...' }` per errori
- Logging errori con `console.error()` per debugging

### Response Handling
- `return res.status(404).json(...)` per evitare double-response
- `RETURNING *` nelle query INSERT/UPDATE/DELETE per restituire dati modificati
- Controllo `dbRes.rows.length === 0` per rilevare record non trovati

### Database
- Parametrized queries con `$1, $2` per prevenire SQL injection
- Transaction con BEGIN/COMMIT/ROLLBACK per operazioni atomiche (apply)
- `TRUNCATE ... RESTART IDENTITY CASCADE` per reset completo con identity reset
- `client.release()` in finally block per evitare connection leaks
- ON DELETE CASCADE per integrità referenziale automatica

### Validazione
- Controllo tipi con `typeof` (string/number)
- Whitelist `validIntervals = [500, 1000, 5000]`
- Validazione applicata sia su POST singolo che su POST /apply (per ogni variabile)

## Docker Compose Setup (TODO)

```yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: plc_data
    volumes:
      - ./backend/db/sql/init.sql:/docker-entrypoint-initdb.d/init.sql
      - timescale-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      DB_HOST: timescaledb
      DB_PORT: 5432
      DB_USER: admin
      DB_PASSWORD: admin
      DB_NAME: plc_data
      PORT: 3001
      WS_PORT: 3002
    ports:
      - "3001:3001"
      - "3002:3002"
    depends_on:
      - timescaledb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  timescale-data:
```

## Test Effettuati

### Variables API
✅ **POST /api/variables** - Inserimento variabile
✅ **DELETE /api/variables/3** - Eliminazione variabile + CASCADE
✅ **GET /api/variables/3** - Verifica 404 → `{ message: 'Variable not found' }`

### S7Service
✅ Script `test.js` in `services/s7/` per test manuale connessione PLC

## Workflow Utente (Target)

1.  **Config PLC**: GET/PUT su `/api/plc` per impostare IP/rack/slot/port PLC
2.  **Gestione Variabili**:
    - GET `/api/variables` — Lista variabili
    - POST `/api/variables` — Aggiungi singola variabile
    - PUT `/api/variables/:id` — Modifica variabile (**DA IMPLEMENTARE**)
    - DELETE `/api/variables/:id` — Rimuovi variabile + CASCADE dati
3.  **Apply Config**: POST `/api/variables/apply` → TRUNCATE + INSERT bulk + restart polling
4.  **Avvia Polling**: POST `/api/polling/start` → connessione PLC + loop lettura + INSERT su DB
5.  **Visualizza Dati**: GET `/api/data` per storico, WebSocket per realtime

---

## Stato Prossimi Steps

### Backend — Completato ✅
- [x] Setup directory structure
- [x] Database schema con TimescaleDB (`db/sql/init.sql`)
- [x] pg Pool singleton (`db/index.js`)
- [x] API Variables: GET, POST, DELETE, POST /apply (con validazione)
- [x] S7Service: classe con connect/reconnect/disconnect/read (Promise-based)
- [x] PollingManager: gestione loop di campionamento e callback
- [x] API Polling: Start/Stop con gestione istanza singleton

### ⚡ Prossimi 3 Punti da Sviluppare

---

#### 1. 🌐 Implementare WebSocket per streaming realtime (PRIORITÀ ALTA)

**Problema**: Il frontend ha bisogno di aggiornamenti realtime. Attualmente i dati vanno solo su DB.

**Cosa fare**:
- Creare `services/websocket/wsManager.js`:
  - Avvia un `WebSocketServer` (usando il modulo `ws` già installato).
  - Gestisce una lista di client connessi.
  - Metodo `broadcast(data)` per inviare i dati a tutti.
- Integrare nel `callback` di `polling.js`:
  - Oltre a scrivere su DB, inviare l'oggetto `res` al `wsManager.broadcast`.
- Avviare il server WS in `server.js` (può condividere la porta o usarne una dedicata `WS_PORT`).

**Risultato atteso**: Ogni lettura dal PLC viene immediatamente "pushata" via WebSocket.

---

#### 2. 📡 Implementare API PLC + API Data (Storico & Aggregati)

**Problema**: Non c'è ancora un modo per leggere lo storico dati o cambiare IP del PLC via API.

**Cosa fare**:
- `GET /api/data`: Query su TimescaleDB con filtri `sensor_id`, `from`, `to`.
- `GET/PUT /api/plc`: Per gestire la configurazione in `plc_config`.
- (Opzionale ma consigliato) Supporto per `time_bucket` di TimescaleDB per aggregare i dati (es. media ogni minuto) per i grafici a lungo termine.

---

#### 3. �️ Frontend: Dashboard Realtime & Configurazione

**Problema**: L'applicazione non ha ancora un'interfaccia utente.

**Cosa fare**:
- Inizializzare progetto React (Vite).
- Creare la pagina "Configurazione" per gestire le variabili (CRUD).
- Creare la "Dashboard" con card realtime (via WebSocket) e grafici storici (via API `/api/data`).
- Implementare il tasto "Applica" che invia `/api/variables/apply`.

---

### Frontend (TODO — dopo completamento backend)
1. Setup React + Vite + routing
2. Componente configurazione PLC (form IP/rack/slot/port + PUT /api/plc)
3. Componente gestione variabili (tabella + form CRUD + apply)
4. Componente visualizzazione trend (chart library — es. Chart.js o Recharts)
5. WebSocket client per dati realtime

### DevOps (TODO — dopo completamento backend + frontend)
1. Dockerfile backend (node:20-alpine)
2. Dockerfile frontend (node build + nginx serve)
3. Docker Compose orchestration (aggiornare credenziali .env)
4. Script `wait-for-db.sh` per health check DB prima di avviare backend
5. Testing integrazione end-to-end

## Note Tecniche

- **PowerShell**: Usare `Invoke-RestMethod` invece di `curl` per test API
- **Porta backend**: 3001 (non 3000 per evitare conflitti con React dev server)
- **Porta WebSocket**: 3002 (configurabile via `WS_PORT` in `.env`)
- **Formato indirizzi nodes7**: usare notazione S7 nativa (es. `DB10,REAL0`, `DB10,X2.0`) — NON la notazione Siemens TIA Portal (es. `DB10.DBW0`)
- **Validazione intervalli**: solo 500, 1000, 5000 ms ammessi (whitelist)
- **CASCADE**: Eliminare variabile → elimina automaticamente tutti i dati storici associati
- **PollingManager**: deve essere singleton — istanziato una volta sola e passato alle route via closure o modulo
- **init.sql**: ora in `db/sql/init.sql` (spostato da root backend)