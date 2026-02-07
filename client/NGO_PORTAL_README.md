# NGO Portal - Backend Integration

The NGO portal is now connected to the backend API for managing goods requests.

## Prerequisites

1. **Backend Server** must be running on port 3000
2. **MongoDB** must be connected and running
3. **Node.js** installed

## Setup

### 1. Start the Backend Server

```bash
cd Server
npm install
npm run dev
```

The server should start on `http://localhost:3000`

### 2. Start the Frontend (Next.js)

```bash
cd client
npm install
npm run dev
```

The client should start on `http://localhost:3001` (or next available port)

### 3. Configure Environment Variables

The client uses `.env.local` to configure the API URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## API Endpoints Used

### 1. Create Request

- **Endpoint**: `POST /api/v1/request/createRequest`
- **Description**: Creates a new goods request from an NGO
- **Payload**:

```json
{
  "requesterNode": "67269fa0c4d26edff3ddb08a",
  "requestId": "REQ-1730534567890",
  "createdOn": "2024-11-02T10:30:00.000Z",
  "requiredBefore": "2024-11-10T00:00:00.000Z",
  "items": [
    {
      "foodType": "Rice",
      "required_kg": 500
    }
  ]
}
```

### 2. Get All Requests for NGO

- **Endpoint**: `GET /api/v1/request/getAllRequets/:ngoId`
- **Description**: Retrieves all requests submitted by a specific NGO
- **Query Parameters**:
  - `page` (optional): Page number (default: 1)
  - `limit` (optional): Items per page (default: 10)
  - `status` (optional): Filter by status (pending, approved, fulfilled, rejected, cancelled)
- **Example**: `GET /api/v1/request/getAllRequets/67269fa0c4d26edff3ddb08a?page=1&limit=100`

### 3. Update Request Status

- **Endpoint**: `PATCH /api/v1/request/:requestID/status`
- **Description**: Updates the status of a request (used by admin)
- **Payload**:

```json
{
  "status": "approved",
  "approvedOn": "2024-11-02T10:30:00.000Z"
}
```

## Important Configuration

### NGO Node ID

The NGO portal currently uses a hardcoded NGO ID:

```typescript
const CURRENT_NGO = {
  id: "67269fa0c4d26edff3ddb08a", // Replace with actual NGO node ID
  name: "Food For All Mumbai",
  // ... other fields
};
```

**Important**: Replace this ID with an actual NGO Node ID from your MongoDB database:

1. Connect to your MongoDB
2. Find an NGO node in the `nodes` collection where `type: "ngo"`
3. Copy the `_id` value
4. Update the `CURRENT_NGO.id` in `client/src/app/ngo/page.tsx`

## Features

### 1. Overview Tab

- Statistics cards showing total, pending, approved, and fulfilled requests
- "New Request" button to create new goods requests
- Recent requests list (last 3 requests)

### 2. Requests Tab

- Complete list of all requests submitted by the NGO
- Each request card shows:
  - Item type and quantity
  - Description
  - Request date and required-by date
  - Current status
- Click "View Details" to see full request information

### 3. Analytics Tab

- Status distribution with progress bars
- Fulfillment rate (circular chart)
- Approval rate (circular chart)
- Timeline view of all requests

## Data Flow

1. **NGO submits a request** → Frontend calls `createRequest` API → Request stored in MongoDB
2. **Admin views requests** → Admin portal shows all pending requests
3. **Admin approves/rejects** → Admin calls `updateRequestStatus` API
4. **NGO refreshes** → Frontend calls `getRequestsByNGO` → Sees updated status

## Testing

### 1. Test Creating a Request

1. Open the NGO portal
2. Click "New Request" button
3. Fill in the form:
   - Item Type: "Rice"
   - Quantity: "500"
   - Unit: "kg"
   - Required By: Select a future date
   - Description: "Emergency supply"
4. Click "Submit Request"
5. Check MongoDB to verify the request was created

### 2. Test Viewing Requests

1. Ensure at least one request exists in MongoDB for your NGO node
2. Refresh the NGO portal
3. Check the Overview tab for recent requests
4. Navigate to the Requests tab to see all requests
5. Click "View Details" on any request

### 3. Test Status Updates

1. Create a request from the NGO portal
2. Go to the Admin portal
3. Approve or reject the request
4. Refresh the NGO portal
5. Verify the status is updated

## Troubleshooting

### "Failed to fetch requests" Error

- **Cause**: Backend server not running or wrong API URL
- **Solution**:
  1. Check if backend is running on port 3000
  2. Verify `.env.local` has correct `NEXT_PUBLIC_API_URL`
  3. Check browser console for network errors

### "No requests found for NGO" Error

- **Cause**: NGO ID doesn't exist in database or no requests created yet
- **Solution**:
  1. Verify the NGO node exists in MongoDB
  2. Check that `CURRENT_NGO.id` matches the node's `_id`
  3. Try creating a new request first

### "Missing required fields" Error

- **Cause**: Request payload doesn't match expected format
- **Solution**:
  1. Check that all form fields are filled
  2. Verify date format is correct (ISO string)
  3. Check browser console for detailed error

### CORS Errors

- **Cause**: Frontend and backend on different origins
- **Solution**:
  1. Ensure backend has CORS enabled
  2. Check `Server/src/app.js` has `app.use(cors())`

## Next Steps

- [ ] Implement authentication (JWT tokens)
- [ ] Add user login system
- [ ] Connect NGO ID from logged-in user instead of hardcoded value
- [ ] Add real-time updates using WebSockets
- [ ] Implement file uploads for request documents
- [ ] Add request editing functionality
- [ ] Add request cancellation feature
- [ ] Implement pagination for large request lists
