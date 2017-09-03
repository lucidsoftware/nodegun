#!/usr/bin/env node
import {ArgumentParser} from 'argparse';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import {real} from './command';
import {CommandFactory} from './commandfactory';
import {MasterServer} from './cluster';
import {Server} from './server';

if (fs.existsSync(__filename.replace(/\.js$/, '.ts'))) {
    require('source-map-support').install();
}

const npmPackage = require('./package.json');

const parser = new ArgumentParser({description: 'Node.js server that supports the Nailgun protocol.', version: npmPackage.version});
{
    const transportGroup = parser.addArgumentGroup({
        description: 'Transport and address. TCP is used by default.',
        title:'Transport',
    });
    const transport = transportGroup.addMutuallyExclusiveGroup();
    transport.addArgument(['--tcp'], {
        constant: '127.0.0.1:2113',
        help: 'TCP address to listen to, given as ip, port, or ip:port. IP defaults to 0.0.0.0, and port defaults to 2113.',
        nargs: '?',
    });
    transport.addArgument(['--local'], {
        constant:'/tmp/nodegun.sock',
        help: 'Local address to listen to. Defaults to /tmp/nodegun.sock.',
        nargs:'?',
    });
    const debugGroup = parser.addArgumentGroup({
        description: 'Optionally expose internal status information via HTTP server.',
        title: 'Status',
    });
    const debugTransport = debugGroup.addMutuallyExclusiveGroup();
    debugTransport.addArgument(['--status-tcp'], {
        help: 'TCP address to listen to for status, given as ip, port, or ip:port. IP defaults to 0.0.0.0.',
        metavar: 'TCP',
    });
    debugTransport.addArgument(['--status-local'], {
        help: 'Local address to listen to for status.',
        metavar: 'LOCAL',
    });
    parser.addArgument(['--workers'], {
        constant:os.cpus().length,
        help: 'If present, number of worker processes to start. A flag with no argument starts one per CPU.',
        nargs:'?',
    });
}
const args: {status_local:string|undefined, status_tcp:string|undefined, tcp:string|undefined, local:string|undefined, workers:number|undefined} = parser.parseArgs();

function listen(server: net.Server) {
    if (args.local) {
        server.listen(args.local);
    } else if (args.tcp) {
        const [first, second] = args.tcp.split(':', 2) as [string, string|undefined];
        if (second == null) {
            if (first.includes('.')) {
                server.listen(2113, first);
            } else {
                server.listen(first);
            }
        } else {
            server.listen(+first, second);
        }
    } else {
        server.listen(2113);
    }
}

// since Node.js sets SO_REUSEADDR for all AF_INET sockets, it seems consistent to reuse for AF_UNIX
if (args.local) {
    try {
        fs.unlinkSync(args.local);
    } catch (e) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
}

let server: MasterServer | Server;
if (!args.workers || args.workers <= 0) {
    server = new Server(new CommandFactory());
} else {
    server = new MasterServer(require.resolve('./worker.js'), args.workers);
}
listen(server.server);

if (args.local) {
    const local = args.local;
    const inode = fs.statSync(local).ino;
    const socketCheck = setInterval(() => {
        try {
            if (inode === fs.statSync(local).ino) {
                return;
            }
        } catch (e) {
            if (e.code !== 'ENOENT') {
                real.stderrWrite(`${e.stack}\n`);
                return;
            }
        }
        clearInterval(socketCheck);
        real.stderrWrite('Socket deleted\n');
        server.shutdown();
    }, 5 * 1000);
    socketCheck.unref();
}

{
    const statusServer = http.createServer((request, response) => {
        response.writeHead(200, {'Content-Type': 'application/json'});
        server.status().then(status => {
            response.write(JSON.stringify(status, undefined, 4));
            response.write('\n');
            response.end();
        });
    });
    statusServer.unref();
    if (args.status_local) {
        fs.unlinkSync(args.status_local);
        statusServer.listen(args.status_local);
    } else if (args.status_tcp) {
        const [first, second] = args.status_tcp.split(':', 2) as [string, string|undefined];
        if (second == null) {
            statusServer.listen(+first);
        } else {
            statusServer.listen(+first, second);
        }
    }
}
