export type CrmCommunication = "Email" | "Phone" | "Slack" | "None";

export type CrmOnlinePresence = "Active" | "Idle" | "Offline";

export type CrmDensity = "comfortable" | "compact";

export type CrmCustomer = {
  id: string;
  account: string;
  location: string;
  website: string;
  categories: string[];
  lead: string;
  team: string;
  amount: number;
  startDate: string;
  communication: CrmCommunication;
  onlinePresence: CrmOnlinePresence;
  founded: number;
  founders: string;
  employees: string;
  email: string;
  lastInteraction: string;
  responseRate: number;
  stock: {
    change: number;
  };
};
