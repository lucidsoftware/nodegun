import {CommandFactory} from './commandfactory';
import {WorkerServer} from './cluster';
import * as fs from 'fs';

if (fs.existsSync(__filename.replace(/\.js$/, '.ts'))) {
    require('source-map-support').install();
}

new WorkerServer(new CommandFactory());
