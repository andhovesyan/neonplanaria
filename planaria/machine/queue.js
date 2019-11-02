const tape = require('./tape')
const fs = require('fs')
const Queue = require('better-queue');
const tapeFile = "/tape.txt"

function sleep(time = 500) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

async function readJSONfromFile(file) {
  let d = null;
  let retries = 0;
  while (!d) {
    try {
      const res = fs.readFileSync(file, "utf-8");
      d = JSON.parse(res);
    } catch (e) {
      if (retries > 100) {
        throw new Error('Reached maximum number of retries!');
      }
      retries++;
      console.log("PLANARIA", "failed to parse mempool.json on", retries, "retry");
      await sleep(1000);
    }
  }
  return d;
}

const init = function(config) {
  return new Queue(function(o, cb) {
    let localTape = o.c.tape || process.cwd();
    if (o.type === 'block') {
      let blockpath = o.subdir + "/" + o.height + ".json"
      console.log("PLANARIA", "Reading from bitbus", blockpath);
      if (fs.existsSync(blockpath)) {
        try {
          let d = JSON.parse(res)
          Promise.all([
            readJSONfromFile(blockpath),
            readJSONfromFile(o.subdir + "/mempool.json"),
          ]).then(async (d, mem) => {
            try {
              if (o.c.onblock) {
                let m = JSON.parse(mem)
                await o.c.onblock({
                  height: o.height,
                  tx: d,
                  mem: m,
                  tape: o.tape
                })
                await tape.write("BLOCK " + d[0].blk.i + " " + Date.now(), localTape + tapeFile)
              }
              cb()  // success
            } catch (e2) {
              cb(e2)  // error
            }
          });
        } catch (e) {
          cb(e) // error
        }
      } else {
        cb()  // the block doesn't exist for the sub-blockchain. go to the next block.
      }
      cb();
    } else if (o.type === 'mempool') {
      console.log("PLANARIA", "Reading from bitbus", "mempool");
      readJSONfromFile(o.subdir + "/mempool.json").then(async (d) => {
        try {
          let txs = d.filter(function(item) {
            return item.tx.h === o.hash
          })
          if (txs.length > 0) {
            let tx = txs[0];
            if (o.c.onmempool) {
              await o.c.onmempool({
                tx: tx,
                tape: o.tape
              })
              // ONLY AFTER onmempool finishes successfully, add to log
              await tape.write("MEMPOOL " + o.hash + " " + Date.now(), localTape + tapeFile)
            }
            cb()
          } else {
            console.error('no tx!');
            cb("tx doesn't exist")
          }
        } catch (e) {
          console.error(e);
          cb(e)
        }
      });
    };
  }, config)
}
module.exports = {
  init: init
}
