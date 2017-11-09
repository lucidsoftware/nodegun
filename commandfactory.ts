import * as fs from 'fs';
import {Command} from './command';

class Resolver {
    private readonly cache: Map<string, Map<string, string>> = new Map();

    resolve(directory: string, path: string) {
        const pathCache = this.cache.get(directory) || this.cache.set(directory, new Map()).get(directory)!;
        module.paths.unshift(directory);
        let result = pathCache.get(path);
        if (!result) {
            try {
                result = require.resolve(path);
            } finally {
                module.paths.shift();
            }
            pathCache.set(path, result);
        }
        return result;
    }
}

export class CommandFactory {
    private readonly cache = new Map<string, Command>();
    private readonly resolver = new Resolver();

    create(workingDirectory: string, path: string) {
        const resolved = this.resolver.resolve(workingDirectory, path);
        let result = this.cache.get(resolved);
        if (!result) {
            const oldJs = require.extensions['.js'];
            require.extensions['.js'] = (module: NodeModule, filename: string) => {
                module.id = '.';
                let content = fs.readFileSync(resolved, 'utf-8');
                // remove BOM, copied from internal/module stripBOM
                if (content.charCodeAt(0) === 0xFEFF) {
                   content = content.slice(1);
                }
                module._compile(`require.main = process.mainModule = module; module.exports = () => {${content}\n};`, filename);
                require.extensions['.js'] = oldJs;
            };
            try {
                result = new Command(require(resolved));
            } finally {
                require.extensions['.js'] = oldJs;
            }
            this.cache.set(resolved, result);
        }
        return result;
    }
}
