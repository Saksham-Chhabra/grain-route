/**
 * Request and Response Logging Middleware
 * Logs all incoming requests and outgoing responses to the terminal
 */

const logger = (req, res, next) => {
  const startTime = Date.now();

  // Log request details
  const timestamp = new Date().toISOString();
  console.log("\n" + "=".repeat(80));
  console.log(`📥 [${timestamp}] REQUEST`);
  console.log("─".repeat(80));
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.protocol}://${req.get("host")}${req.originalUrl}`);
  console.log(`IP: ${req.ip || req.connection.remoteAddress}`);
  
  // Log headers (optional - you can remove this if too verbose)
  if (Object.keys(req.headers).length > 0) {
    console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
  }

  // Log query parameters
  if (Object.keys(req.query).length > 0) {
    console.log(`Query:`, JSON.stringify(req.query, null, 2));
  }

  // Log request body (if exists and not too large)
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyStr = JSON.stringify(req.body, null, 2);
    // Truncate very large bodies
    const maxBodyLength = 1000;
    if (bodyStr.length > maxBodyLength) {
      console.log(`Body: ${bodyStr.substring(0, maxBodyLength)}... (truncated)`);
    } else {
      console.log(`Body:`, bodyStr);
    }
  }

  // Store original functions
  const originalEnd = res.end;
  const originalJson = res.json;
  const originalSend = res.send;

  // Initialize response body storage
  res.locals.responseBody = null;

  // Override res.json to capture response body
  res.json = function (body) {
    try {
      res.locals.responseBody = typeof body === "object" ? body : JSON.parse(body);
    } catch (e) {
      res.locals.responseBody = body;
    }
    return originalJson.call(this, body);
  };

  // Override res.send to capture response body
  res.send = function (body) {
    if (!res.locals.responseBody) {
      try {
        if (typeof body === "string") {
          res.locals.responseBody = JSON.parse(body);
        } else {
          res.locals.responseBody = body;
        }
      } catch (e) {
        res.locals.responseBody = body;
      }
    }
    return originalSend.call(this, body);
  };

  // Override res.end to log response after it's sent
  res.end = function (chunk, encoding) {
    // Only log once
    if (!res.locals.logged) {
      res.locals.logged = true;
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Log response details
      console.log("\n" + "─".repeat(80));
      console.log(`📤 [${new Date().toISOString()}] RESPONSE`);
      console.log("─".repeat(80));
      console.log(`Status: ${res.statusCode} ${res.statusMessage || ""}`);
      console.log(`Response Time: ${responseTime}ms`);

      // Log response body if available
      if (res.locals.responseBody) {
        try {
          const responseStr = JSON.stringify(res.locals.responseBody, null, 2);
          const maxResponseLength = 1000;
          if (responseStr.length > maxResponseLength) {
            console.log(`Response Body: ${responseStr.substring(0, maxResponseLength)}... (truncated)`);
          } else {
            console.log(`Response Body:`, responseStr);
          }
        } catch (e) {
          console.log(`Response Body: [Unable to stringify]`);
        }
      } else if (chunk) {
        // If no body was captured but chunk exists, try to log it
        try {
          const chunkStr = chunk.toString();
          if (chunkStr.length > 0 && chunkStr.length < 500) {
            console.log(`Response Body: ${chunkStr}`);
          }
        } catch (e) {
          // Ignore if can't convert chunk
        }
      }

      console.log("=".repeat(80) + "\n");
    }

    // Call original end function
    return originalEnd.call(this, chunk, encoding);
  };

  next();
};

export default logger;

