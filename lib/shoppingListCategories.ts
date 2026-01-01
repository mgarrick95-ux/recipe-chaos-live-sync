// lib/shoppingListCategories.ts

export type ShoppingCategory =
  | "Produce"
  | "Meat & Seafood"
  | "Dairy & Eggs"
  | "Bakery"
  | "Frozen"
  | "Pantry"
  | "Spices & Baking"
  | "Snacks"
  | "Beverages"
  | "Household"
  | "Other";

function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

export function categorizeItemName(name: string): ShoppingCategory {
  const n = (name || "").toLowerCase().trim();
  if (!n) return "Other";

  // Household / non-food
  if (
    hasAny(n, [
      "paper towel",
      "toilet paper",
      "tissue",
      "garbage bag",
      "trash bag",
      "dish soap",
      "laundry",
      "detergent",
      "cleaner",
      "bleach",
      "foil",
      "parchment",
      "ziplock",
      "ziploc",
      "sponge",
      "wipes",
    ])
  ) {
    return "Household";
  }

  // Beverages
  if (
    hasAny(n, [
      "coffee",
      "tea",
      "juice",
      "soda",
      "pop",
      "sparkling water",
      "water",
      "energy drink",
    ])
  ) {
    return "Beverages";
  }

  // Dairy & Eggs
  if (
    hasAny(n, [
      "milk",
      "cream",
      "half and half",
      "butter",
      "cheese",
      "yogurt",
      "sour cream",
      "cottage cheese",
      "cream cheese",
      "eggs",
      "parmesan",
      "mozzarella",
      "cheddar",
    ])
  ) {
    return "Dairy & Eggs";
  }

  // Meat & Seafood
  if (
    hasAny(n, [
      "beef",
      "steak",
      "ground beef",
      "pork",
      "bacon",
      "ham",
      "sausage",
      "chicken",
      "turkey",
      "roast",
      "ribs",
      "salmon",
      "tuna",
      "shrimp",
      "fish",
    ])
  ) {
    return "Meat & Seafood";
  }

  // Produce
  if (
    hasAny(n, [
      "lettuce",
      "spinach",
      "kale",
      "cucumber",
      "tomato",
      "onion",
      "garlic",
      "carrot",
      "celery",
      "pepper",
      "zucchini",
      "mushroom",
      "broccoli",
      "cauliflower",
      "potato",
      "sweet potato",
      "avocado",
      "lemon",
      "lime",
      "apple",
      "banana",
      "orange",
      "berries",
      "strawberry",
      "blueberry",
      "grapes",
      "cilantro",
      "parsley",
      "basil",
      "ginger",
    ])
  ) {
    return "Produce";
  }

  // Bakery
  if (hasAny(n, ["bread", "bun", "buns", "tortilla", "wrap", "bagel", "pita"])) {
    return "Bakery";
  }

  // Frozen
  if (
    hasAny(n, [
      "frozen",
      "ice cream",
      "fries",
      "pizza",
      "nuggets",
      "perogies",
      "pierogies",
    ])
  ) {
    return "Frozen";
  }

  // Snacks
  if (
    hasAny(n, ["chips", "cracker", "cookies", "chocolate", "granola", "snack"])
  ) {
    return "Snacks";
  }

  // Spices & Baking
  if (
    hasAny(n, [
      "flour",
      "baking soda",
      "baking powder",
      "yeast",
      "vanilla",
      "cinnamon",
      "paprika",
      "oregano",
      "thyme",
      "spice",
      "salt",
      "pepper",
      "cocoa",
    ])
  ) {
    return "Spices & Baking";
  }

  // Pantry
  if (
    hasAny(n, [
      "rice",
      "pasta",
      "noodles",
      "sauce",
      "ketchup",
      "mustard",
      "mayo",
      "mayonnaise",
      "vinegar",
      "oil",
      "olive oil",
      "can ",
      "canned",
      "beans",
      "broth",
      "stock",
      "soup",
      "tomato paste",
      "salsa",
      "soy sauce",
      "hot sauce",
      "sugar",
    ])
  ) {
    return "Pantry";
  }

  return "Other";
}
