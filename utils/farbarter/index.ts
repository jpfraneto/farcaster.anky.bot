export async function checkIfListingIsAvailable(listingId: string) {
  const listing = await contract.listings(listingId);
  return listing.remainingSupply > 0 && listing.isActive;
}
