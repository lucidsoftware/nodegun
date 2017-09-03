import {BaseServer} from './server';
import {CommandFactory} from './commandfactory';
import {real} from './command';
import * as childProcess from 'child_process';
import * as events from 'events';
import * as net from 'net';

export class MasterServer {
    private readonly workers: {child: childProcess.ChildProcess, connections: number}[] = [];
    public readonly server: net.Server;
    
    constructor(module: string, workerCount: number) {
        for (let i = 0; i < workerCount; i++) {
            const child = childProcess.fork(module, []);
            const worker = {child, connections:0};
            child.on('message', (message) => {
                if (message === 'finished') {
                    --worker.connections;
                }
            });
            this.workers.push(worker);
        }
        // Balance by least connections. Prefer certain workers when breaking ties, in order to capitilize on JIT.
        this.server = net.createServer();
        this.server.once('listening', () => (this.server as any)._handle.onconnection = (err: any, tcp: any) => {
            // TODO: check err
            const worker = this.workers.reduce((a, b) => a.connections <= b.connections ? a : b);
            ++worker.connections;
            worker.child.send('connection', tcp);
        });
    }

    status(): Promise<any> {
        return Promise.all(this.workers.map(({child, connections}) => {
            return new Promise<string>(resolve => {
                child.send('status', error => error && resolve(error.toString()));
                child.on('message', function listener(this: events.EventEmitter, message) {
                    if (message && message.type === 'status') {
                        resolve(message.value);
                        this.removeListener('message', listener);
                    }
                });
            }).then(process => ({process, connections}));
        })).then(workers => ({workers}));
    }

    shutdown() {
        // TODO: something else(?)
        setTimeout(() => real.processExit(), 5 * 1000);
    }
}

export class WorkerServer extends BaseServer {
    constructor(commandFactory: CommandFactory) {
        process.on('message', (message, handle) => {
            if (message === 'connection') {
                this.connection(new net.Socket({allowHalfOpen:true, fd:handle.fd, readable:true, writable:true}));
            } else if (message === 'status') {
                this.status().then(value => process.send!({type:'status', value}));
            }
        });
        super(commandFactory, (process as any).channel || (process as any)._channel);
    }

    protected connection(socket: net.Socket) {
        socket.once('close', () => process.send!('finished'));
        super.connection(socket);
    }
}
