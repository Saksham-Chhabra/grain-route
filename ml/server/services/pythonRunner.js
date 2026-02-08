const { spawn } = require('child_process');

function runPythonModule({ pythonBin, cwd, moduleName, args = [], payload }) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ['-m', moduleName, ...args], { cwd });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(`Python process exited with code ${code}`);
        error.stderr = stderr;
        error.stdout = stdout;
        return reject(error);
      }
      try {
        const data = stdout ? JSON.parse(stdout) : {};
        return resolve(data);
      } catch (parseError) {
        parseError.stderr = stderr;
        parseError.stdout = stdout;
        return reject(parseError);
      }
    });

    if (payload !== undefined) {
      child.stdin.write(
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      );
    }
    child.stdin.end();
  });
}

function runInference({ pythonBin, cwd, modelDir, payload }) {
  // Payload can be either { records: [...] } (feature rows) or raw Server-model data
  // such as { nodes: [...], requests: [...], shipments: [...], batches: [...], freq: 'M' }.
  const effectivePayload =
    payload && typeof payload === 'object' ? payload : {};
  return runPythonModule({
    pythonBin,
    cwd,
    moduleName: 'src.infer',
    args: ['--model-dir', modelDir],
    payload: effectivePayload,
  });
}

function runTransferPlanner({ pythonBin, cwd, args = [], payload }) {
  return runPythonModule({
    pythonBin,
    cwd,
    moduleName: 'src.transfer_planner',
    args,
    payload,
  });
}

module.exports = {
  runPythonModule,
  runInference,
  runTransferPlanner,
};
