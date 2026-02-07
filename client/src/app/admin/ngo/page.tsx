"use client";

import React, { useState, useEffect } from "react";
import {
  adminService,
  type GoodsRequest as ApiGoodsRequest,
  type NGO as ApiNGO,
} from "@/services/admin.service";

interface NGO {
  id: string;
  name: string;
  registrationNumber: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  district: string;
  state: string;
  status: "active" | "inactive" | "pending";
  joinedDate: string;
  totalRequests: number;
  fulfilledRequests: number;
  pendingRequests: number;
}

interface GoodsRequest {
  _id?: string;
  id?: string;
  ngoId?: string;
  ngoName?: string;
  requesterNode?:
    | string
    | {
        _id: string;
        name: string;
        contactInfo?: any;
      };
  requestId?: string;
  requestID?: string;
  itemType?: string;
  items?: {
    foodType: string;
    required_kg: number;
  }[];
  quantity?: number;
  unit?: string;
  urgency?: "low" | "medium" | "high" | "critical";
  requestDate?: string;
  requiredBy?: string;
  requiredBy_iso?: string;
  requiredBefore?: string; // Backend field name
  createdOn?: string; // Backend field name
  description?: string;
  status: "pending" | "approved" | "fulfilled" | "cancelled";
  createdAt?: string;
  updatedAt?: string;
  approvedOn?: string | null;
  fullFilledOn?: string | null;
}

// Mock data for NGOs
const MOCK_NGOS: NGO[] = [
  {
    id: "1",
    name: "Food For All Mumbai",
    registrationNumber: "NGO-MUM-2020-001",
    contactPerson: "Rajesh Kumar",
    email: "contact@foodforall-mumbai.org",
    phone: "+91 98765 43210",
    address: "123 Main Street, Andheri East",
    district: "Mumbai",
    state: "Maharashtra",
    status: "active",
    joinedDate: "2020-03-15",
    totalRequests: 145,
    fulfilledRequests: 132,
    pendingRequests: 13,
  },
  {
    id: "2",
    name: "Hope Foundation Delhi",
    registrationNumber: "NGO-DEL-2019-045",
    contactPerson: "Priya Sharma",
    email: "info@hopefoundation-delhi.org",
    phone: "+91 98765 43211",
    address: "456 Connaught Place",
    district: "Delhi",
    state: "Delhi",
    status: "active",
    joinedDate: "2019-08-22",
    totalRequests: 198,
    fulfilledRequests: 185,
    pendingRequests: 13,
  },
  {
    id: "3",
    name: "Care India Bangalore",
    registrationNumber: "NGO-BLR-2021-023",
    contactPerson: "Amit Patel",
    email: "contact@careindia-blr.org",
    phone: "+91 98765 43212",
    address: "789 MG Road",
    district: "Bangalore",
    state: "Karnataka",
    status: "active",
    joinedDate: "2021-01-10",
    totalRequests: 87,
    fulfilledRequests: 79,
    pendingRequests: 8,
  },
  {
    id: "4",
    name: "Hunger Free Pune",
    registrationNumber: "NGO-PUN-2020-067",
    contactPerson: "Sneha Deshmukh",
    email: "info@hungerfree-pune.org",
    phone: "+91 98765 43213",
    address: "321 FC Road",
    district: "Pune",
    state: "Maharashtra",
    status: "pending",
    joinedDate: "2024-10-28",
    totalRequests: 5,
    fulfilledRequests: 0,
    pendingRequests: 5,
  },
];

// Mock goods requests from NGOs
const MOCK_GOODS_REQUESTS: GoodsRequest[] = [
  {
    id: "req-1",
    ngoId: "1",
    ngoName: "Food For All Mumbai",
    itemType: "Rice",
    quantity: 500,
    unit: "kg",
    urgency: "high",
    requestDate: "2024-11-01",
    requiredBy: "2024-11-05",
    description:
      "Emergency supply needed for flood-affected families in Andheri area",
    status: "pending",
  },
  {
    id: "req-2",
    ngoId: "2",
    ngoName: "Hope Foundation Delhi",
    itemType: "Wheat Flour",
    quantity: 300,
    unit: "kg",
    urgency: "medium",
    requestDate: "2024-10-30",
    requiredBy: "2024-11-08",
    description: "Monthly distribution for community kitchen program",
    status: "pending",
  },
  {
    id: "req-3",
    ngoId: "3",
    ngoName: "Care India Bangalore",
    itemType: "Lentils (Dal)",
    quantity: 200,
    unit: "kg",
    urgency: "critical",
    requestDate: "2024-10-28",
    requiredBy: "2024-11-02",
    description: "Urgent requirement for orphanage - existing stock depleted",
    status: "pending",
  },
  {
    id: "req-4",
    ngoId: "1",
    ngoName: "Food For All Mumbai",
    itemType: "Cooking Oil",
    quantity: 100,
    unit: "liters",
    urgency: "low",
    requestDate: "2024-10-27",
    requiredBy: "2024-11-10",
    description: "Regular monthly supply for distribution center",
    status: "pending",
  },
];

export default function NGODashboard() {
  const [ngos, setNgos] = useState<ApiNGO[]>([]);
  const [selectedNGO, setSelectedNGO] = useState<ApiNGO | null>(null);
  const [ngoRequests, setNgoRequests] = useState<GoodsRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<GoodsRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<GoodsRequest | null>(
    null
  );
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch NGOs from database
  useEffect(() => {
    fetchNGOs();
  }, []);

  // Fetch all requests on component mount
  useEffect(() => {
    fetchAllRequests();
  }, []);

  const fetchNGOs = async () => {
    try {
      const ngoList = await adminService.getAllNGOs();
      setNgos(ngoList);
    } catch (err) {
      console.error("Error fetching NGOs:", err);
    }
  };

  const fetchAllRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Only fetch PENDING requests for the notification/incoming requests
      const requests = await adminService.getAllRequests(1, 100, "pending");
      console.log("Raw API response:", requests);
      console.log("First request structure:", requests[0]);
      console.log("First request ID (_id):", requests[0]?._id);
      console.log("First request ID (id):", requests[0]?.id);
      setIncomingRequests(requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requests");
      console.error("Error fetching requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNGORequests = async (ngoId: string) => {
    try {
      const requests = await adminService.getRequestsByNGO(ngoId);
      console.log("NGO-specific requests:", requests);
      setNgoRequests(requests);
    } catch (err) {
      console.error("Error fetching NGO requests:", err);
      setNgoRequests([]);
    }
  };

  // Form state for new NGO
  const [newNGO, setNewNGO] = useState({
    name: "",
    registrationNumber: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    district: "",
    state: "",
  });

  // Filter NGOs based on search and status
  const filteredNGOs = ngos.filter((ngo) => {
    const matchesSearch =
      ngo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ngo.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ngo.contactInfo.contactPerson &&
        ngo.contactInfo.contactPerson
          .toLowerCase()
          .includes(searchQuery.toLowerCase()));

    // Since database NGO doesn't have status field, consider all as active
    const matchesStatus = statusFilter === "all" || statusFilter === "active";

    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalNGOs = ngos.length;
  const activeNGOs = ngos.length; // All NGOs are active since no status field
  const pendingNGOs = 0; // No pending status in database
  const incomingRequestsCount = incomingRequests.length;

  const handleAddNGO = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle add NGO logic here
    console.log("Adding NGO:", newNGO);
    setIsAddModalOpen(false);
    setNewNGO({
      name: "",
      registrationNumber: "",
      contactPerson: "",
      email: "",
      phone: "",
      address: "",
      district: "",
      state: "",
    });
  };

  const handleAcceptRequest = async (requestId?: string) => {
    if (!requestId) {
      console.error("No request ID provided");
      return;
    }

    console.log("Attempting to approve request with ID:", requestId);
    setIsLoading(true);
    setError(null);
    try {
      const requestToUpdate = incomingRequests.find(
        (req) => (req._id || req.id) === requestId
      );
      if (!requestToUpdate) {
        console.error("Request not found in local state:", requestId);
        return;
      }

      console.log("Request to update:", requestToUpdate);
      console.log("Calling API to approve request...");

      // Call API to approve request
      const updatedRequest = await adminService.updateRequestStatus(
        requestId,
        "approved"
      );

      console.log("API response:", updatedRequest);

      // Remove the approved request from incoming requests list
      setIncomingRequests(
        incomingRequests.filter((req) => (req._id || req.id) !== requestId)
      );

      // Close modals
      setIsRequestsModalOpen(false);
      setSelectedRequest(null);

      console.log("Successfully approved request:", requestToUpdate);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to approve request";
      setError(errorMessage);
      console.error("Error approving request:", err);
      alert("Error: " + errorMessage); // Show alert for debugging
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectRequest = async (requestId?: string) => {
    if (!requestId) {
      console.error("No request ID provided");
      return;
    }

    console.log("Attempting to reject request with ID:", requestId);
    setIsLoading(true);
    setError(null);
    try {
      const requestToUpdate = incomingRequests.find(
        (req) => (req._id || req.id) === requestId
      );
      if (!requestToUpdate) {
        console.error("Request not found in local state:", requestId);
        return;
      }

      console.log("Request to update:", requestToUpdate);
      console.log("Calling API to reject request...");

      // Call API to reject request - use 'cancelled' status instead of 'rejected'
      const updatedRequest = await adminService.updateRequestStatus(
        requestId,
        "cancelled"
      );

      console.log("API response:", updatedRequest);

      // Remove the cancelled request from incoming requests list
      setIncomingRequests(
        incomingRequests.filter((req) => (req._id || req.id) !== requestId)
      );

      // Close modals
      setIsRequestsModalOpen(false);
      setSelectedRequest(null);

      console.log("Successfully rejected request:", requestToUpdate);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reject request";
      setError(errorMessage);
      console.error("Error rejecting request:", err);
      alert("Error: " + errorMessage); // Show alert for debugging
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions to handle different data formats
  const getRequestId = (request: GoodsRequest) => {
    return request._id || request.id || "";
  };

  const getNGOName = (request: GoodsRequest) => {
    if (request.ngoName) return request.ngoName;
    if (
      typeof request.requesterNode === "object" &&
      request.requesterNode?.name
    ) {
      return request.requesterNode.name;
    }
    return "Unknown NGO";
  };

  const getItemType = (request: GoodsRequest) => {
    if (request.itemType) return request.itemType;
    if (request.items && request.items.length > 0) {
      return request.items.map((i) => i.foodType).join(", ");
    }
    return "N/A";
  };

  const getQuantity = (request: GoodsRequest) => {
    if (request.quantity) return `${request.quantity} ${request.unit || "kg"}`;
    if (request.items && request.items.length > 0) {
      const total = request.items.reduce((sum, i) => sum + i.required_kg, 0);
      return `${total} kg`;
    }
    return "N/A";
  };

  const getRequestDate = (request: GoodsRequest) => {
    if (request.requestDate) return request.requestDate;
    if (request.createdAt)
      return new Date(request.createdAt).toISOString().split("T")[0];
    return new Date().toISOString().split("T")[0];
  };

  const getRequiredBy = (request: GoodsRequest) => {
    if (request.requiredBy) return request.requiredBy;
    if (request.requiredBy_iso)
      return new Date(request.requiredBy_iso).toISOString().split("T")[0];
    return "";
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-purple-600 dark:bg-purple-500">
                <svg
                  className="h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  NGO Management
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Partner Organizations Dashboard
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Notification Bell for Incoming Requests */}
              <button
                onClick={() => setIsRequestsModalOpen(true)}
                className="relative rounded-full p-2 text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                title="View incoming requests"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {incomingRequestsCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                    {incomingRequestsCount}
                  </span>
                )}
              </button>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                India Region
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Statistics Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Total NGOs
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                  {totalNGOs}
                </p>
              </div>
              <div className="rounded-full bg-purple-100 p-3 dark:bg-purple-950">
                <svg
                  className="h-6 w-6 text-purple-600 dark:text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Active NGOs
                </p>
                <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
                  {activeNGOs}
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-950">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Pending Approval
                </p>
                <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                  {pendingNGOs}
                </p>
              </div>
              <div className="rounded-full bg-orange-100 p-3 dark:bg-orange-950">
                <svg
                  className="h-6 w-6 text-orange-600 dark:text-orange-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Pending Goods Requests
                </p>
                <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
                  {incomingRequestsCount}
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3 dark:bg-blue-950">
                <svg
                  className="h-6 w-6 text-blue-600 dark:text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <svg
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search NGOs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex rounded-md border border-zinc-300 dark:border-zinc-700">
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-2 text-sm transition-colors ${
                  viewMode === "grid"
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-2 text-sm transition-colors border-l border-zinc-300 dark:border-zinc-700 ${
                  viewMode === "list"
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Add NGO Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add New NGO
          </button>
        </div>

        {/* NGO Grid/List */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredNGOs.map((ngo) => (
              <div
                key={ngo._id}
                onClick={() => {
                  setSelectedNGO(ngo);
                  fetchNGORequests(ngo._id);
                }}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-5 transition-all hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                {/* NGO Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {ngo.name}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      ID: {ngo._id}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                    active
                  </span>
                </div>

                {/* Location */}
                <div className="mb-3 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>{ngo.address}</span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Total Requests
                    </p>
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                      {ngo.requestStats.total}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Fulfilled
                    </p>
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {ngo.requestStats.completed}
                    </p>
                  </div>
                </div>

                {/* Contact Person */}
                <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Contact Person
                  </p>
                  {/* <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {ngo.contactInfo.contactPerson}
                  </p> */}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    NGO Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Requests
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredNGOs.map((ngo) => (
                  <tr
                    key={ngo._id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        {ngo.name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        ID: {ngo._id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">
                      {ngo.address}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900 dark:text-zinc-100">
                        {ngo.contactInfo.contactPerson}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {ngo.contactInfo.phone || "N/A"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                        active
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">
                      {ngo.requestStats.total}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedNGO(ngo)}
                        className="text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {filteredNGOs.length === 0 && (
          <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                No NGOs found
              </h3>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Try adjusting your search or filters
              </p>
            </div>
          </div>
        )}
      </main>

      {/* NGO Detail Modal */}
      {selectedNGO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedNGO.name}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  ID: {selectedNGO._id}
                </p>
              </div>
              <button
                onClick={() => setSelectedNGO(null)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Status Badge */}
              <div className="mb-6">
                <span className="inline-flex rounded-full px-3 py-1 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                  ACTIVE
                </span>
              </div>

              {/* Statistics Grid */}
              <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Total Requests
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedNGO.requestStats.total}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Completed
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
                    {selectedNGO.requestStats.completed}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Pending
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                    {selectedNGO.requestStats.pending}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Approved
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
                    {selectedNGO.requestStats.approved}
                  </p>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Contact Information
                </h3>
                <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Contact Person
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedNGO.contactInfo.contactPerson}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Email
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedNGO.contactInfo.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Phone
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedNGO.contactInfo.phone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg
                      className="mt-0.5 h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Address
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedNGO.address}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Requests Section */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Recent Food Requests
                </h3>
                <div className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  {ngoRequests.length > 0 ? (
                    ngoRequests.slice(0, 5).map((request, idx) => (
                      <div
                        key={request._id || idx}
                        className={`flex items-center justify-between ${
                          idx < ngoRequests.length - 1 && idx < 4
                            ? "border-b border-zinc-200 pb-2 dark:border-zinc-800"
                            : ""
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {request.items
                              ?.map((item) => item.foodType)
                              .join(", ") || "Food Request"}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Requested:{" "}
                            {new Date(
                              request.createdOn || request.createdAt || ""
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            request.status === "fulfilled"
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                              : request.status === "pending"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                                : request.status === "approved"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {request.status?.charAt(0).toUpperCase() +
                            request.status?.slice(1)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      No requests found for this NGO
                    </p>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Additional Information
                </h3>
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Created Date
                    </span>
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {selectedNGO.createdAt
                        ? new Date(selectedNGO.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            }
                          )
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <button
                onClick={() => setSelectedNGO(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Close
              </button>
              <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600">
                Edit NGO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add NGO Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-zinc-900 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Add New NGO
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddNGO} className="p-6">
              <div className="space-y-4">
                {/* NGO Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    NGO Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={newNGO.name}
                    onChange={(e) =>
                      setNewNGO({ ...newNGO, name: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Enter NGO name"
                  />
                </div>

                {/* Registration Number */}
                <div>
                  <label
                    htmlFor="registrationNumber"
                    className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Registration Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="registrationNumber"
                    required
                    value={newNGO.registrationNumber}
                    onChange={(e) =>
                      setNewNGO({
                        ...newNGO,
                        registrationNumber: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="e.g., NGO-MUM-2024-001"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label
                    htmlFor="contactPerson"
                    className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="contactPerson"
                    required
                    value={newNGO.contactPerson}
                    onChange={(e) =>
                      setNewNGO({ ...newNGO, contactPerson: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Enter contact person name"
                  />
                </div>

                {/* Email and Phone */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={newNGO.email}
                      onChange={(e) =>
                        setNewNGO({ ...newNGO, email: e.target.value })
                      }
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      required
                      value={newNGO.phone}
                      onChange={(e) =>
                        setNewNGO({ ...newNGO, phone: e.target.value })
                      }
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label
                    htmlFor="address"
                    className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Address <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="address"
                    required
                    rows={3}
                    value={newNGO.address}
                    onChange={(e) =>
                      setNewNGO({ ...newNGO, address: e.target.value })
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    placeholder="Enter full address"
                  />
                </div>

                {/* District and State */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label
                      htmlFor="district"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      District <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="district"
                      required
                      value={newNGO.district}
                      onChange={(e) =>
                        setNewNGO({ ...newNGO, district: e.target.value })
                      }
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="Enter district"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="state"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="state"
                      required
                      value={newNGO.state}
                      onChange={(e) =>
                        setNewNGO({ ...newNGO, state: e.target.value })
                      }
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      placeholder="Enter state"
                    />
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                >
                  Add NGO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Incoming Requests Modal */}
      {isRequestsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white dark:bg-zinc-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                  Goods Requests from NGOs
                </h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Review and manage food/goods requests from partner NGOs
                </p>
              </div>
              <button
                onClick={() => setIsRequestsModalOpen(false)}
                className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {incomingRequestsCount === 0 ? (
                <div className="py-12 text-center">
                  <svg
                    className="mx-auto h-16 w-16 text-zinc-300 dark:text-zinc-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-zinc-900 dark:text-white">
                    No Pending Requests
                  </h3>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    All goods requests have been processed.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                request.urgency === "critical"
                                  ? "bg-red-100 dark:bg-red-950"
                                  : request.urgency === "high"
                                    ? "bg-orange-100 dark:bg-orange-950"
                                    : request.urgency === "medium"
                                      ? "bg-yellow-100 dark:bg-yellow-950"
                                      : "bg-blue-100 dark:bg-blue-950"
                              }`}
                            >
                              <svg
                                className={`h-5 w-5 ${
                                  request.urgency === "critical"
                                    ? "text-red-600 dark:text-red-400"
                                    : request.urgency === "high"
                                      ? "text-orange-600 dark:text-orange-400"
                                      : request.urgency === "medium"
                                        ? "text-yellow-600 dark:text-yellow-400"
                                        : "text-blue-600 dark:text-blue-400"
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                                {request.items && request.items.length > 0
                                  ? request.items
                                      .map(
                                        (item: any) =>
                                          `${item.foodType} - ${item.required_kg} kg`
                                      )
                                      .join(", ")
                                  : "No items specified"}
                              </h3>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                Requested by{" "}
                                {typeof request.requesterNode === "object"
                                  ? request.requesterNode?.name
                                  : request.ngoName || "Unknown NGO"}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${
                                request.urgency === "critical"
                                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                                  : request.urgency === "high"
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                                    : request.urgency === "medium"
                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                              }`}
                            >
                              {request.urgency}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="flex items-center gap-2 text-sm">
                              <svg
                                className="h-4 w-4 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                                />
                              </svg>
                              <span className="text-zinc-600 dark:text-zinc-400">
                                <span className="font-medium">Items:</span>{" "}
                                {request.items && request.items.length > 0
                                  ? request.items.map(
                                      (item: any, idx: number) => (
                                        <span key={idx}>
                                          {item.foodType} ({item.required_kg}{" "}
                                          kg)
                                          {idx < request.items.length - 1
                                            ? ", "
                                            : ""}
                                        </span>
                                      )
                                    )
                                  : "N/A"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <svg
                                className="h-4 w-4 text-zinc-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              <span className="text-zinc-600 dark:text-zinc-400">
                                <span className="font-medium">
                                  Required by:
                                </span>{" "}
                                {request.requiredBefore
                                  ? new Date(
                                      request.requiredBefore
                                    ).toLocaleDateString()
                                  : "Not specified"}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 rounded-lg bg-white p-3 text-sm dark:bg-zinc-900">
                            <p className="font-medium text-zinc-700 dark:text-zinc-300">
                              Description:
                            </p>
                            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                              {request.description}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <svg
                              className="h-4 w-4 text-zinc-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span className="text-zinc-600 dark:text-zinc-400">
                              Requested on{" "}
                              {request.createdOn
                                ? new Date(
                                    request.createdOn
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : request.createdAt
                                  ? new Date(
                                      request.createdAt
                                    ).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "Not specified"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            setIsRequestsModalOpen(false);
                            setSelectedRequest(request);
                          }}
                          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => {
                            console.log(
                              "Accept button clicked for request:",
                              request
                            );
                            console.log("Using ID:", request._id || request.id);
                            handleAcceptRequest(request._id || request.id);
                          }}
                          className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                        >
                          ✓ Accept
                        </button>
                        <button
                          onClick={() => {
                            console.log(
                              "Reject button clicked for request:",
                              request
                            );
                            console.log("Using ID:", request._id || request.id);
                            handleRejectRequest(request._id || request.id);
                          }}
                          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Request Details Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white dark:bg-zinc-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Request Details
              </h2>
              <button
                onClick={() => setSelectedRequest(null)}
                className="rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Request Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      selectedRequest.urgency === "critical"
                        ? "bg-red-100 dark:bg-red-950"
                        : selectedRequest.urgency === "high"
                          ? "bg-orange-100 dark:bg-orange-950"
                          : selectedRequest.urgency === "medium"
                            ? "bg-yellow-100 dark:bg-yellow-950"
                            : "bg-blue-100 dark:bg-blue-950"
                    }`}
                  >
                    <svg
                      className={`h-6 w-6 ${
                        selectedRequest.urgency === "critical"
                          ? "text-red-600 dark:text-red-400"
                          : selectedRequest.urgency === "high"
                            ? "text-orange-600 dark:text-orange-400"
                            : selectedRequest.urgency === "medium"
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-blue-600 dark:text-blue-400"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">
                      {selectedRequest.itemType}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Requested by {selectedRequest.ngoName}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase ${
                      selectedRequest.urgency === "critical"
                        ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        : selectedRequest.urgency === "high"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                          : selectedRequest.urgency === "medium"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    }`}
                  >
                    {selectedRequest.urgency} Priority
                  </span>
                </div>
              </div>

              {/* Request Details Grid */}
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    QUANTITY REQUESTED
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-white">
                    {selectedRequest.quantity} {selectedRequest.unit}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    REQUIRED BY
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-white">
                    {selectedRequest.requiredBefore ||
                    selectedRequest.requiredBy
                      ? new Date(
                          selectedRequest.requiredBefore ||
                            selectedRequest.requiredBy ||
                            ""
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "N/A"}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Description
                </h3>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {selectedRequest.description}
                  </p>
                </div>
              </div>

              {/* Request Timeline */}
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Timeline
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <svg
                      className="h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Request Submitted
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedRequest.createdOn
                          ? new Date(
                              selectedRequest.createdOn
                            ).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : selectedRequest.createdAt
                            ? new Date(
                                selectedRequest.createdAt
                              ).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            : "Not specified"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <svg
                      className="h-5 w-5 text-zinc-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Required By
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedRequest.requiredBefore
                          ? new Date(
                              selectedRequest.requiredBefore
                            ).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "Not specified"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    console.log(
                      "Modal Accept button clicked for:",
                      selectedRequest
                    );
                    console.log(
                      "Using ID:",
                      selectedRequest._id || selectedRequest.id
                    );
                    handleAcceptRequest(
                      selectedRequest._id || selectedRequest.id
                    );
                  }}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700"
                >
                  ✓ Approve Request
                </button>
                <button
                  onClick={() => {
                    console.log(
                      "Modal Reject button clicked for:",
                      selectedRequest
                    );
                    console.log(
                      "Using ID:",
                      selectedRequest._id || selectedRequest.id
                    );
                    handleRejectRequest(
                      selectedRequest._id || selectedRequest.id
                    );
                  }}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  ✕ Reject Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
