import { Router } from "express";
//import controllers
 // example endpoint to hit GET /api/events/range?start=<iso>&end=<iso>&lat=<lat>&lon=<lon>&radius=<r>&type=<type?>
//example output , list of all events happening , 
//  {
//   "events": [
//     {
//       "eventId": "...",
//       "time": "...",
//       "type": "shipment_location_update",
//       "payload": {
//         "shipmentId": "SHP001",
//         "coordinates": [77.553, 32.128],
//         "speed_kmh": 47.5
//       }
//     }
//   ]
// }
 
const router = Router();
export default router;

