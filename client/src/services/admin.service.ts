// Admin API Service
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface GoodsRequest {
  _id?: string;
  id?: string;
  requesterNode:
    | string
    | {
        _id: string;
        name: string;
        contactInfo?: {
          contactPerson: string;
          email: string;
          phone: string;
        };
      };
  requestId: string;
  items: {
    foodType: string;
    required_kg: number;
  }[];
  requiredBy_iso: string;
  status: "pending" | "approved" | "fulfilled" | "cancelled";
  fullFilledOn?: string | null;
  fulfilledBy?: string | null;
  approvedOn?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateRequestStatusPayload {
  status: "pending" | "approved" | "fulfilled" | "cancelled";
  fulfilledBy?: string;
  fullFilledOn?: string;
  approvedOn?: string;
}

export interface NGO {
  _id: string;
  name: string;
  address: string;
  contactInfo: {
    contactPerson: string;
    email?: string;
    phone?: string;
  };
  requestStats: {
    pending: number;
    completed: number;
    total: number;
    cancelled: number;
    approved: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

class AdminService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/v1`;
  }

  /**
   * Get all NGOs
   */
  async getAllNGOs(): Promise<NGO[]> {
    try {
      const response = await fetch(`${this.baseUrl}/ngo`);

      if (!response.ok) {
        throw new Error("Failed to fetch NGOs");
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error fetching NGOs:", error);
      throw error;
    }
  }

  /**
   * Get all goods requests (from all NGOs)
   */
  async getAllRequests(
    page: number = 1,
    limit: number = 100,
    status?: string
  ): Promise<GoodsRequest[]> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (status && status !== "all") {
        params.append("status", status);
      }

      const response = await fetch(
        `${this.baseUrl}/request/all?${params.toString()}`
      );

      // If endpoint doesn't exist, return empty array for now
      if (response.status === 404) {
        console.warn("Get all requests endpoint not implemented yet");
        return [];
      }

      if (!response.ok) {
        throw new Error("Failed to fetch requests");
      }

      const data = await response.json();
      return data.data?.requests || [];
    } catch (error) {
      console.error("Error fetching all requests:", error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Get requests for a specific NGO
   */
  async getRequestsByNGO(
    ngoId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<GoodsRequest[]> {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      const response = await fetch(
        `${this.baseUrl}/request/getAllRequets/${ngoId}?${params.toString()}`
      );

      // Handle 404 (no requests found) as empty list
      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new Error("Failed to fetch requests");
      }

      const data = await response.json();
      return data.data?.requests || [];
    } catch (error) {
      console.error("Error fetching requests:", error);
      return [];
    }
  }

  /**
   * Update request status (approve/reject)
   */
  async updateRequestStatus(
    requestId: string,
    status: "approved" | "fulfilled" | "cancelled",
    additionalData?: Partial<UpdateRequestStatusPayload>
  ): Promise<GoodsRequest> {
    try {
      console.log("=== Admin Service: updateRequestStatus called ===");
      console.log("Request ID:", requestId);
      console.log("Status:", status);
      console.log("Additional data:", additionalData);

      const payload: UpdateRequestStatusPayload = {
        status,
        ...additionalData,
      };

      // Add timestamp based on status
      if (status === "approved" && !payload.approvedOn) {
        payload.approvedOn = new Date().toISOString();
      } else if (status === "fulfilled" && !payload.fullFilledOn) {
        payload.fullFilledOn = new Date().toISOString();
      }

      const url = `${this.baseUrl}/request/${requestId}/status`;
      console.log("Full URL:", url);
      console.log("Payload:", JSON.stringify(payload, null, 2));

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        console.log("Error response content-type:", contentType);

        if (contentType && contentType.includes("application/json")) {
          const error = await response.json();
          console.error("Error response body:", error);
          throw new Error(error.message || "Failed to update request status");
        } else {
          const text = await response.text();
          console.error("Error response text:", text);
          throw new Error(
            `Server returned ${response.status}: ${response.statusText}`
          );
        }
      }

      const data = await response.json();
      console.log("Success response:", data);
      console.log("Returning data.data:", data.data);
      return data.data;
    } catch (error) {
      console.error("=== Error in updateRequestStatus ===");
      console.error("Error updating request status:", error);
      throw error;
    }
  }
}

export const adminService = new AdminService();
