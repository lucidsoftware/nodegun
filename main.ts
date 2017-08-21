#!/usr/bin/env node
import {ArgumentParser} from 'argparse';
import * as cluster from 'cluster';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import {CommandFactory} from './commandfactory';
import {Server} from './server';

try {
    require('source-map-support').install();
} catch(e) {
}

const npmPackage = require('./package.json');

const parser = new ArgumentParser({description: 'Start Node.js server that supports the Nailgun protocol.', version: npmPackage.version});
const transport = parser.addMutuallyExclusiveGroup();
transport.addArgument(['--tcp'], {
    constant: '127.0.0.1:2113',
    help:'TCP address to listen to, given as ip, port, or ip:port. IP defaults to 0.0.0.0, and port defaults to 2113. If no other transport is specified, TCP is used.',
    nargs: '?',
});
transport.addArgument(['--local'], {
    constant:'/tmp/nodegun.sock',
    help: 'Local address to listen to. Defaults to /tmp/nodegun.sock.',
    nargs:'?',
});
parser.addArgument(['--workers'], {
    constant:os.cpus().length,
    help:'If present, number of worker processes to start. A flag with no argument starts one per CPU.',
    nargs:'?',
});
const args: {tcp:string|undefined, local:string|undefined, workers:number|undefined} = parser.parseArgs();

function startServer() {
    const server = new Server(new CommandFactory());
    if (args.local) {
        server.server.listen(args.local);
    } else if (args.tcp) {
        const [first, second] = args.tcp.split(':', 2) as [string, string|undefined];
        if (second == null) {
            if (first.includes('.')) {
                server.server.listen(2113, first);
            } else {
                server.server.listen(first);
            }
        } else {
            server.server.listen(+first, second);
        }
    } else {
        server.server.listen(2113);
    }
}

if (!args.workers || args.workers < 0) {
    startServer();
} else if (cluster.isMaster) {
    if (args.local) {
        try {
            fs.unlinkSync(args.local);
        } catch (e) {
        }
    }
    for (let i = 0; i < args.workers; i++) {
        cluster.fork();
    }
} else {
    startServer();
}
