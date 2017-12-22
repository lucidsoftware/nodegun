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

/**
 * Copied from internal/module
 */
function stripBOM(content: string) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}

/**
 * Copied from internal/module
 */
function stripShebang(content: string) {
  // Remove shebang
  var contLen = content.length;
  if (contLen >= 2) {
    if (content.charCodeAt(0) === 35/*#*/ &&
        content.charCodeAt(1) === 33/*!*/) {
      if (contLen === 2) {
        // Exact match
        content = '';
      } else {
        // Find end of shebang line and slice it off
        var i = 2;
        for (; i < contLen; ++i) {
          var code = content.charCodeAt(i);
          if (code === 10/*\n*/ || code === 13/*\r*/)
            break;
        }
        if (i === contLen)
          content = '';
        else {
          // Note that this actually includes the newline character(s) in the
          // new output. This duplicates the behavior of the regular expression
          // that was previously used to replace the shebang line
          content = content.slice(i);
        }
      }
    }
  }
  return content;
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
                content = stripBOM(content);
                content = stripShebang(content);
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
