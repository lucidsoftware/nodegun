console.log('Hello world');
for (const arg of process.argv.slice(2)) {
    console.log(`Argument: ${arg}\n`);
}
console.log(`Working Directory: ${process.cwd()}`);
