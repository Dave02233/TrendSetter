const nodes7 = require("nodes7");

function connectPromise(conn, ip, port, rack, slot) {
  return new Promise((resolve, reject) => {
    conn.initiateConnection(
      {
        host: ip,
        port: port,
        rack: rack,
        slot: slot,
      },
      (e) => {
        if (e) {
          reject(e);
        } else {
          resolve();
        }
      },
    );
  });
}

function dropPromise(conn) {
  return new Promise((resolve, reject) => {
    conn.dropConnection((e) => {
      if (e) reject(e);
      else resolve();
    });
  });
}

class S7Service {
  constructor() {
    this.conn = new nodes7();
    this.connected = false;
  }

  async connect(ip, port, rack, slot, addresses) {
    try {
      await connectPromise(this.conn, ip, port, rack, slot);
      this.connected = true;
      this.conn.addItems(addresses);
    } catch (e) {
      this.connected = false;
      throw new Error(`Connection failed: ${e.message}`);
    }
  }

  async reconnect(ip, port, rack, slot, addresses) {
    try {
      await this.disconnect();
      await this.connect(ip, port, rack, slot, addresses);
    } catch (e) {
      throw new Error(`Error while reconnecting: ${e.message}`);
    }
  }

  async disconnect() {
    if (this.conn && this.connected) {
      try {
        await dropPromise(this.conn);
      } catch (e) {
        throw new Error(`Error while disconnecting: ${e.message}`);
      }
    }
  }

  async readVariables(variables) {
    try {
      const res = await this.conn.readVariables();
      return res;
    } catch (e) {
      throw new Error(`Error reading variables: ${e.message}`);
    }
  }
}

module.exports = S7Service;
