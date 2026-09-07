import os from 'node:os';
import { createDemoServer } from './room-server.mjs';
const server = createDemoServer();
server.listen(4173, '0.0.0.0', () => {
  console.log('Demo ready at http://127.0.0.1:4173/');
  for (const entries of Object.values(os.networkInterfaces()))
    for (const entry of entries || [])
      if (entry.family === 'IPv4' && !entry.internal)
        console.log('LAN: http://' + entry.address + ':4173/');
  console.log('Rooms stay in memory until this server closes.');
});
