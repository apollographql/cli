import * as accounts from './accounts';
import * as books from './books';
import * as documents from './documents';
import * as inventory from './inventory';
import * as product from './product';
import * as reviews from './reviews';
import * as reviewsWithUpdate from './special-cases/reviewsWithUpdate';
import * as accountsWithoutTagOrInaccessible from './special-cases/accountsWithoutTagOrInaccessible';
import * as reviewsWithoutTagOrInaccessible from './special-cases/reviewsWithoutTagOrInaccessible';

export {
  accounts,
  books,
  documents,
  inventory,
  product,
  reviews,
  reviewsWithUpdate,
};

export const fixtures = [
  accounts,
  books,
  documents,
  inventory,
  product,
  reviews,
];

export const fixturesWithUpdate = [
  accounts,
  books,
  documents,
  inventory,
  product,
  reviewsWithUpdate,
];

export const fixturesWithoutTagOrInaccessible = [
  accountsWithoutTagOrInaccessible,
  books,
  documents,
  inventory,
  product,
  reviewsWithoutTagOrInaccessible,
];

export const fixtureNames = [
  accounts.name,
  product.name,
  inventory.name,
  reviews.name,
  books.name,
  documents.name,
];
