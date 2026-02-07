// NGO API Service
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface GoodsRequest {
  _id?: string;
  id?: string;
  requesterNode: string;
  requestId: string;
  items: {
    foodType: string;
    required_kg: number;
  }[];
  requiredBy_iso: string;
  status: "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";
  fullFilledOn?: string | null;
  fulfilledBy?: string | null;
  approvedOn?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateRequestPayload {
  requesterNode: string;
  requestId: string;
  createdOn: string;
  requiredBefore: string;
  items: {
    foodType: string;
    required_kg: number;
  }[];
}

export interface UpdateRequestStatusPayload {
  status: "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";
  fulfilledBy?: string;
  fullFilledOn?: string;
  approvedOn?: string;
}

export interface GetRequestsResponse {
  currentPage: number;
  totalPages: number;
  totalRequests: number;
  requestsOnPage: number;
  requests: GoodsRequest[];
}

class NGOService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1/request`;
  }

  /**
   * Create a new goods request
   */
  async createRequest(payload: CreateRequestPayload): Promise<GoodsRequest> {
    try {
      const response = await fetch(`${this.baseUrl}/createRequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create request");
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("Error creating request:", error);
      throw error;
    }
  }

  /**
   * Get all requests for an NGO
   */
  async getRequestsByNGO(
    ngoId: string,
    page: number = 1,
    limit: number = 100,
    status?: string
  ): Promise<GetRequestsResponse> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (status) {
        params.append("status", status);
      }

      const url = `${this.baseUrl}/getAllRequets/${ngoId}?${params.toString()}`;
      console.log("Fetching requests from:", url);

      const response = await fetch(url);

      console.log("Response status:", response.status);
      console.log(
        "Response headers:",
        Object.fromEntries(response.headers.entries())
      );

      // Handle 404 (no requests found) as empty list
      if (response.status === 404) {
        console.log("No requests found (404), returning empty array");
        return {
          currentPage: 1,
          totalPages: 0,
          totalRequests: 0,
          requestsOnPage: 0,
          requests: [],
        };
      }

      if (!response.ok) {
        // Try to parse JSON error, fallback to text
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          throw new Error(error.message || "Failed to fetch requests");
        } else {
          const text = await response.text();
          console.error("Non-JSON error response:", text);
          throw new Error(
            `Server returned ${response.status}: ${response.statusText}`
          );
        }
      }

      const data = await response.json();
      console.log("Received data:", data);
      return data.data;
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw error;
    }
  }

  /**
   * Update request status
   */
  async updateRequestStatus(
    requestId: string,
    payload: UpdateRequestStatusPayload
  ): Promise<GoodsRequest> {
    try {
      const response = await fetch(`${this.baseUrl}/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update request status");
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("Error updating request status:", error);
      throw error;
    }
  }
}

export const ngoService = new NGOService();
