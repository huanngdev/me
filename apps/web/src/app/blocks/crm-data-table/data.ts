import { faker } from "@faker-js/faker";

import type { CrmCustomer } from "@repo/core/components/blocks/crm-data-table/crm-data-table-block";

const CATEGORIES = [
  "SaaS",
  "Fintech",
  "Healthcare",
  "Retail",
  "Logistics",
  "Artificial Intelligence",
  "Security",
  "Education",
] as const;

const TEAMS = ["Engineering", "Design", "Growth", "Customer Success", "Operations"] as const;

const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "200-500", "500+"] as const;

const COMMUNICATION = ["Email", "Phone", "Slack", "None"] as const;

const ONLINE_PRESENCE = ["Active", "Idle", "Offline"] as const;

export function generateCrmCustomers(count = 20): CrmCustomer[] {
  faker.seed(20260911);

  return Array.from({ length: count }, (_, index) => ({
    id: `customer-${index + 1}`,
    account: faker.company.name(),
    location: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
    website: faker.internet.domainName(),
    categories: faker.helpers.arrayElements([...CATEGORIES], { min: 1, max: 3 }),
    lead: faker.person.fullName(),
    team: faker.helpers.arrayElement([...TEAMS]),
    amount: faker.number.int({ min: 1_000, max: 250_000 }),
    startDate: faker.date.past({ years: 5 }).toISOString(),
    communication: faker.helpers.arrayElement([...COMMUNICATION]),
    onlinePresence: faker.helpers.arrayElement([...ONLINE_PRESENCE]),
    founded: faker.date.past({ years: 30 }).getFullYear(),
    founders: faker.person.fullName(),
    employees: faker.helpers.arrayElement([...EMPLOYEE_RANGES]),
    email: faker.internet.email().toLowerCase(),
    lastInteraction: faker.date.recent({ days: 30 }).toISOString(),
    responseRate: faker.number.int({ min: 35, max: 99 }),
    stock: {
      change: faker.number.float({ min: -9.99, max: 9.99, fractionDigits: 2 }),
    },
  }));
}
