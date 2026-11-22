// Read the actual candidate page on the isolated Android browser.
// The Python runner uses adb for touch, swipes and keyboard commands.
import fs from 'node:fs';

const [action, argument] = process.argv.slice(2);
const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = pages.find(p => p.type === 'page' && p.url.startsWith('http://127.0.0.1:8941')) || pages.find(p => p.type === 'page');
if (!page) throw Error('Chrome does not expose a page for this device.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
const call = (method, params) => new Promise((resolve, reject) => {
  socket.onmessage = event => {
    const reply = JSON.parse(event.data);
    if (reply.id !== 1) return;
    if (reply.error) reject(Error(JSON.stringify(reply.error)));
    else resolve(reply.result);
  };
  socket.send(JSON.stringify({ id: 1, method, params }));
});
if (action === 'read') {
  const result=await call('Runtime.evaluate',{expression:argument,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails) throw Error(result.result?.description || 'Evaluation error');
  console.log(JSON.stringify(result.result.value ?? null));
} else if (action === 'goto') {
  if (!argument.startsWith('http://127.0.0.1:8941/')) throw Error('Test navigation is limited to the local candidate.');
  await call('Page.navigate',{url:argument});
} else throw Error('Unexpected test command');
socket.close();
