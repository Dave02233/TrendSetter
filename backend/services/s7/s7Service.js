require('dotenv').config();

const nodes7 = require('nodes7');

class S7Service {
    constructor () {
        this.conn = new nodes7();
        this.connected = false;
    }

    async connect (ip, port, rack, slot) {
        try {
            this.conn.initiateConnection({
                host: ip,
                port: port,
                rack: rack,
                slot: slot
            }, (e) => e)

            this.connected = true;
        } catch (e) {
            this.connected = false;
        }
    }

    async reconnect (ip, port, rack, slot) {
        this.conn.dropConnection()
        
    }

    async disconnect() {
        if (this.conn && this.connected) {
            this.conn.dropConnection()
                .then(
                    this.connected = false;
                );
        }
    }

    async readVariables(variables) {

    }

}

module.exports = S7Service;