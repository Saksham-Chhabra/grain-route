"use client";

import React, { useState, useEffect } from "react";
import { ngoService } from "@/services/ngo.service";

interface GoodsRequest {
  _id?: string;
  id?: string;
  requesterNode?: string;
  requestId?: string;
  requestID?: string; // Backend uses this
  itemType?: string;
  quantity?: number;
  unit?: string;
  urgency?: "low" | "medium" | "high" | "critical";
  requestDate?: string;
  requiredBy?: string;
  requiredBy_iso?: string;
  requiredBefore?: string; // Backend field name
  createdOn?: string; // Backend field name
  description?: string;
  status: "pending" | "approved" | "rejected" | "fulfilled" | "cancelled";
  items?: {
    foodType: string;
    required_kg: number;
  }[];
  createdAt?: string;
  fullFilledOn?: string | null;
  fulfilledBy?: string | null;
  approvedOn?: string | null;
}

// Mock NGO data (in real app, this would come from auth/API)
const CURRENT_NGO = {
  id: "67269fa0c4d26edff3ddb08a", // Replace with actual NGO node ID from your database
  name: "Food For All Mumbai",
  registrationNumber: "NGO-MUM-2020-001",
  contactPerson: "Rajesh Kumar",
  email: "contact@foodforall-mumbai.org",
  phone: "+91 98765 43210",
  district: "Mumbai",
  state: "Maharashtra",
};

export default function NGOPortal() {
  const [requests, setRequests] = useState<GoodsRequest[]>([]);
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<GoodsRequest | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<
    "overview" | "requests" | "analytics"
  >("overview");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for new request
  const [newRequest, setNewRequest] = useState({
    itemType: "",
    quantity: "",
    unit: "kg",
    urgency: "medium" as "low" | "medium" | "high" | "critical",
    requiredBy: "",
  });

  // Fetch requests on component mount
  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await ngoService.getRequestsByNGO(CURRENT_NGO.id);
      setRequests(response.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch requests");
      console.error("Error fetching requests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate statistics
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const approvedRequests = requests.filter(
    (r) => r.status === "approved"
  ).length;
  const fulfilledRequests = requests.filter(
    (r) => r.status === "fulfilled"
  ).length;
  const rejectedRequests = requests.filter(
    (r) => r.status === "rejected"
  ).length;

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        requesterNode: CURRENT_NGO.id,
        requestId: `REQ-${Date.now()}`,
        createdOn: new Date().toISOString(),
        requiredBefore: new Date(newRequest.requiredBy).toISOString(),
        items: [
          {
            foodType: newRequest.itemType,
            required_kg: Number(newRequest.quantity),
          },
        ],
      };

      await ngoService.createRequest(payload);

      // Refresh requests list
      await fetchRequests();

      setIsNewRequestModalOpen(false);
      setNewRequest({
        itemType: "",
        quantity: "",
        unit: "kg",
        urgency: "medium",
        requiredBy: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create request");
      console.error("Error creating request:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper functions to handle different data formats
  const getRequestId = (request: GoodsRequest) => {
    return request._id || request.id || "";
  };

  const getItemType = (request: GoodsRequest) => {
    if (request.itemType) return request.itemType;
    if (request.items && request.items.length > 0) {
      return request.items[0].foodType;
    }
    return "N/A";
  };

  const getQuantity = (request: GoodsRequest) => {
    if (request.quantity) return request.quantity;
    if (request.items && request.items.length > 0) {
      return request.items[0].required_kg;
    }
    return 0;
  };

  const getRequestDate = (request: GoodsRequest) => {
    if (request.requestDate) return request.requestDate;
    if (request.createdAt)
      return new Date(request.createdAt).toISOString().split("T")[0];
    return new Date().toISOString().split("T")[0];
  };

  const getRequiredBy = (request: GoodsRequest) => {
    // Check backend field first
    if (request.requiredBefore) return request.requiredBefore;
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
                  {CURRENT_NGO.name}
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  NGO Portal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                {CURRENT_NGO.district}, {CURRENT_NGO.state}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="mb-6 flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <svg
                className="h-6 w-6 animate-spin text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Loading...
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("overview")}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "overview"
                  ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-500"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("requests")}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "requests"
                  ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-500"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              My Requests
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === "analytics"
                  ? "border-purple-600 text-purple-600 dark:border-purple-500 dark:text-purple-500"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              Analytics
            </button>
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div>
            {/* Statistics Cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Total Requests
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {totalRequests}
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
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Pending
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                      {pendingRequests}
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
                      Approved
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
                      {approvedRequests}
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
                      Fulfilled
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">
                      {fulfilledRequests}
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                Quick Actions
              </h2>
              <button
                onClick={() => setIsNewRequestModalOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 sm:w-auto"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New Request
              </button>
            </div>

            {/* Recent Requests */}
            <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                  Recent Requests
                </h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {requests.slice(0, 3).map((request) => (
                    <div
                      key={getRequestId(request)}
                      onClick={() => setSelectedRequest(request)}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-200 p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950`}
                        >
                          <svg
                            className={`h-5 w-5 text-purple-600 dark:text-purple-400`}
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
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-white">
                            {getItemType(request)} - {getQuantity(request)} kg
                          </p>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Required by{" "}
                            {getRequiredBy(request)
                              ? new Date(
                                  getRequiredBy(request)
                                ).toLocaleDateString()
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          request.status === "fulfilled"
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                            : request.status === "approved"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                              : request.status === "pending"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        }`}
                      >
                        {request.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === "requests" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                All Requests
              </h2>
              <button
                onClick={() => setIsNewRequestModalOpen(true)}
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
                New Request
              </button>
            </div>

            <div className="space-y-4">
              {requests.map((request) => (
                <div
                  key={getRequestId(request)}
                  className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950`}
                      >
                        <svg
                          className={`h-6 w-6 text-purple-600 dark:text-purple-400`}
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
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                            {getItemType(request)}
                          </h3>
                        </div>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          Quantity: {getQuantity(request)} kg
                        </p>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {request.description || "No description"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-500 dark:text-zinc-500">
                          <span>
                            Requested:{" "}
                            {getRequestDate(request)
                              ? new Date(
                                  getRequestDate(request)
                                ).toLocaleDateString()
                              : "N/A"}
                          </span>
                          <span>
                            Required by:{" "}
                            {getRequiredBy(request)
                              ? new Date(
                                  getRequiredBy(request)
                                ).toLocaleDateString()
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          request.status === "fulfilled"
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                            : request.status === "approved"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                              : request.status === "pending"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                        }`}
                      >
                        {request.status}
                      </span>
                      <button
                        onClick={() => setSelectedRequest(request)}
                        className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* Status Distribution */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                Request Status Distribution
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Fulfilled
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {fulfilledRequests} (
                      {Math.round((fulfilledRequests / totalRequests) * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full bg-green-600 dark:bg-green-500"
                      style={{
                        width: `${(fulfilledRequests / totalRequests) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Approved
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {approvedRequests} (
                      {Math.round((approvedRequests / totalRequests) * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full bg-blue-600 dark:bg-blue-500"
                      style={{
                        width: `${(approvedRequests / totalRequests) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Pending
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {pendingRequests} (
                      {Math.round((pendingRequests / totalRequests) * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full bg-orange-600 dark:bg-orange-500"
                      style={{
                        width: `${(pendingRequests / totalRequests) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Rejected
                    </span>
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {rejectedRequests} (
                      {Math.round((rejectedRequests / totalRequests) * 100)}%)
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full bg-red-600 dark:bg-red-500"
                      style={{
                        width: `${(rejectedRequests / totalRequests) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Capacity Metrics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Fulfillment Rate
                </h3>
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <svg className="h-40 w-40" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-zinc-200 dark:text-zinc-800"
                      />
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${(fulfilledRequests / totalRequests) * 100}, 100`}
                        className="text-green-600 dark:text-green-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {Math.round((fulfilledRequests / totalRequests) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  {fulfilledRequests} out of {totalRequests} requests fulfilled
                </p>
              </div>

              <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                  Approval Rate
                </h3>
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <svg className="h-40 w-40" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-zinc-200 dark:text-zinc-800"
                      />
                      <path
                        d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${((approvedRequests + fulfilledRequests) / totalRequests) * 100}, 100`}
                        className="text-blue-600 dark:text-blue-500"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {Math.round(
                          ((approvedRequests + fulfilledRequests) /
                            totalRequests) *
                            100
                        )}
                        %
                      </span>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
                  {approvedRequests + fulfilledRequests} out of {totalRequests}{" "}
                  requests approved
                </p>
              </div>
            </div>

            {/* Recent Activity Timeline */}
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">
                Request Timeline
              </h3>
              <div className="space-y-4">
                {requests
                  .sort((a, b) => {
                    const dateA = getRequestDate(a);
                    const dateB = getRequestDate(b);
                    return (
                      new Date(dateB).getTime() - new Date(dateA).getTime()
                    );
                  })
                  .map((request, index) => (
                    <div key={getRequestId(request)} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            request.status === "fulfilled"
                              ? "bg-green-100 dark:bg-green-950"
                              : request.status === "approved"
                                ? "bg-blue-100 dark:bg-blue-950"
                                : request.status === "pending"
                                  ? "bg-orange-100 dark:bg-orange-950"
                                  : "bg-red-100 dark:bg-red-950"
                          }`}
                        >
                          <div
                            className={`h-3 w-3 rounded-full ${
                              request.status === "fulfilled"
                                ? "bg-green-600 dark:bg-green-500"
                                : request.status === "approved"
                                  ? "bg-blue-600 dark:bg-blue-500"
                                  : request.status === "pending"
                                    ? "bg-orange-600 dark:bg-orange-500"
                                    : "bg-red-600 dark:bg-red-500"
                            }`}
                          />
                        </div>
                        {index < requests.length - 1 && (
                          <div className="h-full w-0.5 bg-zinc-200 dark:bg-zinc-800" />
                        )}
                      </div>
                      <div className="flex-1 pb-8">
                        <p className="font-medium text-zinc-900 dark:text-white">
                          {getItemType(request)} - {getQuantity(request)} kg
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Status: {request.status} •{" "}
                          {getRequestDate(request)
                            ? new Date(
                                getRequestDate(request)
                              ).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Request Modal */}
      {isNewRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white dark:bg-zinc-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
                Submit New Request
              </h2>
              <button
                onClick={() => setIsNewRequestModalOpen(false)}
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

            <form onSubmit={handleSubmitRequest} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Item Type *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRequest.itemType}
                    onChange={(e) =>
                      setNewRequest({ ...newRequest, itemType: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    placeholder="e.g., Rice, Wheat Flour, Lentils"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Quantity *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={newRequest.quantity}
                      onChange={(e) =>
                        setNewRequest({
                          ...newRequest,
                          quantity: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      placeholder="e.g., 100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Unit *
                    </label>
                    <select
                      required
                      value={newRequest.unit}
                      onChange={(e) =>
                        setNewRequest({ ...newRequest, unit: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="kg">Kilograms (kg)</option>
                      <option value="liters">Liters</option>
                      <option value="units">Units</option>
                      <option value="tons">Tons</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Urgency *
                    </label>
                    <select
                      required
                      value={newRequest.urgency}
                      onChange={(e) =>
                        setNewRequest({
                          ...newRequest,
                          urgency: e.target.value as
                            | "low"
                            | "medium"
                            | "high"
                            | "critical",
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Required By *
                    </label>
                    <input
                      type="date"
                      required
                      value={newRequest.requiredBy}
                      onChange={(e) =>
                        setNewRequest({
                          ...newRequest,
                          requiredBy: e.target.value,
                        })
                      }
                      min={new Date().toISOString().split("T")[0]}
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                >
                  Submit Request
                </button>
              </div>
            </form>
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
              <div className="mb-6 flex items-start gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
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
                    className={`h-7 w-7 ${
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${
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
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        selectedRequest.status === "fulfilled"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : selectedRequest.status === "approved"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                            : selectedRequest.status === "pending"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                      }`}
                    >
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Quantity
                    </p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">
                      {getQuantity(selectedRequest)} kg
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Required By
                    </p>
                    <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-white">
                      {getRequiredBy(selectedRequest)
                        ? new Date(
                            getRequiredBy(selectedRequest)
                          ).toLocaleDateString()
                        : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
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
                    <div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Request Date
                      </p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">
                        {getRequestDate(selectedRequest)
                          ? new Date(
                              getRequestDate(selectedRequest)
                            ).toLocaleDateString()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
