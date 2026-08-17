export type LoanOffer = {
  offerId: string;
  type: "auto_loan";
  status: "active" | "expired";
  apr: string;
  maxAmount: string;
  termMonths: number;
};

export type MemberRecord = {
  recordId: string;
  memberId: string;
  displayName: string;
  dobHint: string;
  addressHint: string;
  flags: string[];
  offers: LoanOffer[];
};

export type SearchResult = Pick<MemberRecord, "recordId" | "memberId" | "displayName" | "dobHint" | "addressHint">;

const members: MemberRecord[] = [
  {
    recordId: "rec-24816",
    memberId: "24816",
    displayName: "Maya Chen",
    dobHint: "1992",
    addressHint: "1042",
    flags: [],
    offers: [
      {
        offerId: "OFFER-4421",
        type: "auto_loan",
        status: "active",
        apr: "6.49%",
        maxAmount: "$25,000",
        termMonths: 60
      }
    ]
  },
  {
    recordId: "rec-99999",
    memberId: "99999",
    displayName: "Jordan Rivera",
    dobHint: "1988",
    addressHint: "7710",
    flags: [],
    offers: []
  },
  {
    recordId: "rec-77777-a",
    memberId: "77777",
    displayName: "Avery Patel",
    dobHint: "1984",
    addressHint: "0184",
    flags: [],
    offers: []
  },
  {
    recordId: "rec-77777-b",
    memberId: "77777",
    displayName: "Avery Patel",
    dobHint: "1991",
    addressHint: "0191",
    flags: [],
    offers: [
      {
        offerId: "OFFER-7788",
        type: "auto_loan",
        status: "active",
        apr: "6.89%",
        maxAmount: "$18,000",
        termMonths: 48
      }
    ]
  },
  {
    recordId: "rec-55555",
    memberId: "55555",
    displayName: "Sam Morgan",
    dobHint: "1979",
    addressHint: "5500",
    flags: ["special_handling_notice"],
    offers: [
      {
        offerId: "OFFER-5555",
        type: "auto_loan",
        status: "active",
        apr: "7.12%",
        maxAmount: "$16,500",
        termMonths: 48
      }
    ]
  }
];

export function findMembersById(memberId: string): SearchResult[] {
  return members
    .filter((member) => member.memberId === memberId)
    .map(({ recordId, memberId: id, displayName, dobHint, addressHint }) => ({
      recordId,
      memberId: id,
      displayName,
      dobHint,
      addressHint
    }));
}

export function getMemberByRecordId(recordId: string): MemberRecord | undefined {
  return members.find((member) => member.recordId === recordId);
}
