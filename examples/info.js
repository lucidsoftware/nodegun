for (const arg of process.argv.slice(2)) {
    console.log(`Argument: ${arg}`);
}
console.log(`Working Directory: ${process.cwd()}`);
