-- Initial menu for Shaffi's Bakery.
-- Safe to run more than once: it does nothing if dishes already exist.

do $$
declare
  s_puffs uuid; s_rolls uuid; s_cold uuid; s_chats uuid;
  s_hot uuid; s_buns uuid; s_cakes uuid; s_pastries uuid;
begin
  if (select count(*) from public.dishes) > 0 then
    raise notice 'dishes already exist; skipping seed';
    return;
  end if;

  insert into public.sections(name, display_order) values ('Puffs', 1) returning id into s_puffs;
  insert into public.sections(name, display_order) values ('Rolls', 2) returning id into s_rolls;
  insert into public.sections(name, display_order) values ('Cold Drinks', 3) returning id into s_cold;
  insert into public.sections(name, display_order) values ('Chats', 4) returning id into s_chats;
  insert into public.sections(name, display_order) values ('Hot Drinks', 5) returning id into s_hot;
  insert into public.sections(name, display_order) values ('Buns', 6) returning id into s_buns;
  insert into public.sections(name, display_order) values ('Cakes', 7) returning id into s_cakes;
  insert into public.sections(name, display_order) values ('Pastries', 8) returning id into s_pastries;

  insert into public.dishes(section_id, name, description, price, diet, badge, is_available) values
  -- Puffs
  (s_puffs, 'Veg Puff', 'Flaky golden pastry stuffed with seasoned mixed vegetables.', 25, 'veg', 'popular', true),
  (s_puffs, 'Egg Puff', 'Crisp puff pastry filled with spiced boiled egg.', 25, 'non_veg', 'none', true),
  (s_puffs, 'Chicken Puff', 'Buttery puff pastry packed with spiced minced chicken.', 35, 'non_veg', 'popular', true),
  (s_puffs, 'Mushroom Puff', 'Flaky puff with creamy pepper tossed mushrooms.', 35, 'veg', 'none', true),
  (s_puffs, 'Chicken Leg Piece Puff', 'Whole spiced chicken leg wrapped in crisp puff pastry.', 85, 'non_veg', 'none', true),
  -- Rolls
  (s_rolls, 'Chicken Roll', 'Soft paratha rolled with juicy spiced chicken and onions.', 40, 'non_veg', 'popular', true),
  (s_rolls, 'Veg Roll', 'Paratha wrap filled with crunchy veggies and tangy sauces.', 35, 'veg', 'none', true),
  (s_rolls, 'Egg Roll', 'Classic egg coated paratha roll with onion and green chilli.', 40, 'non_veg', 'none', true),
  -- Cold Drinks (diet 'none' so no veg/non-veg badge shows)
  (s_cold, 'Lemon Juice', 'Freshly squeezed lemon with a hint of sugar and salt.', 40, 'none', 'popular', true),
  (s_cold, 'Lemon Soda', 'Fizzy soda with fresh lime, served chilled.', 60, 'none', 'none', true),
  (s_cold, 'Watermelon', 'Chilled fresh watermelon juice, naturally sweet.', 70, 'none', 'none', true),
  (s_cold, 'Musk Melon', 'Cool cantaloupe juice blended fresh to order.', 70, 'none', 'none', true),
  (s_cold, 'Pineapple', 'Tangy sweet fresh pineapple juice.', 70, 'none', 'none', true),
  (s_cold, 'Grapes', 'Fresh pressed grape juice, light and sweet.', 80, 'none', 'none', true),
  (s_cold, 'Lemon Mint', 'Refreshing lemon and mint cooler to beat the heat.', 80, 'none', 'popular', true),
  (s_cold, 'Gulf Soda', 'Sweet bubbly Gulf soda served ice cold.', 40, 'none', 'none', true),
  (s_cold, 'Rose Milk', 'Chilled milk with fragrant rose syrup.', 60, 'none', 'none', true),
  (s_cold, 'Badam Milk', 'Classic almond milk, rich and refreshing.', 60, 'none', 'popular', true),
  -- Chats
  (s_chats, 'Soya', 'Spiced soya chunks tossed with onion and masala.', 50, 'veg', 'none', true),
  (s_chats, 'Mushroom', 'Peppery mushroom chat with a tangy seasoning.', 50, 'veg', 'none', true),
  (s_chats, 'Egg Mushroom', 'Egg and mushroom chat with a spicy masala kick.', 100, 'non_veg', 'none', true),
  (s_chats, 'Gobi Cauliflower', 'Crisp fried cauliflower tossed in chat masala.', 50, 'veg', 'none', true),
  (s_chats, 'Pani Puri', 'Crisp puris with spiced mint water and fillings.', 50, 'veg', 'popular', true),
  (s_chats, 'Bhel Puri', 'Puffed rice, veggies and tangy tamarind chutney.', 50, 'veg', 'none', true),
  (s_chats, 'Masala Poori', 'Fluffy pooris topped with spiced potato masala.', 50, 'veg', 'none', true),
  -- Hot Drinks
  (s_hot, 'Tea', 'Strong milk tea brewed fresh and served hot.', 20, 'veg', 'popular', true),
  (s_hot, 'Lemon Tea', 'Light black tea with a squeeze of fresh lemon.', 25, 'veg', 'none', true),
  (s_hot, 'Black Tea', 'Simple plain tea, brewed to a clean finish.', 20, 'veg', 'none', true),
  (s_hot, 'Lemon with Honey', 'Warm lemon and honey infusion, soothing and light.', 35, 'veg', 'none', true),
  (s_hot, 'Butterfly Tea', 'Colour changing blue butterfly pea tea.', 50, 'veg', 'none', true),
  (s_hot, 'Jasmine Tea', 'Fragrant green tea scented with jasmine flowers.', 50, 'veg', 'none', true),
  (s_hot, 'Hibiscus Tea', 'Floral hibiscus infusion, tart and ruby red.', 50, 'veg', 'none', true),
  (s_hot, 'Coffee', 'Hot milk coffee, strong and comforting.', 25, 'veg', 'popular', true),
  (s_hot, 'Black Coffee', 'Pure brewed coffee with no milk.', 25, 'veg', 'none', true),
  (s_hot, 'Ginger Coffee', 'Coffee infused with fresh ginger.', 40, 'veg', 'none', true),
  (s_hot, 'Horlicks', 'Warm and comforting malted health drink.', 40, 'veg', 'none', true),
  (s_hot, 'Boost', 'Hot chocolate malt energy drink.', 40, 'veg', 'none', true),
  (s_hot, 'Hot Badam Milk', 'Warm almond milk with saffron and cardamom.', 40, 'veg', 'none', true),
  -- Buns
  (s_buns, 'Bun', 'Soft fresh bakery bun.', 15, 'veg', 'none', true),
  (s_buns, 'Bun Butter', 'Soft bun with a generous spread of butter.', 15, 'veg', 'popular', true),
  (s_buns, 'Bun Butter Jam', 'Bun with butter and sweet fruit jam.', 45, 'veg', 'none', true),
  (s_buns, 'Cream Bun', 'Soft bun filled with sweet vanilla cream.', 25, 'veg', 'none', true),
  (s_buns, 'Jam Bun', 'Bun stuffed with tangy sweet jam.', 25, 'veg', 'none', true),
  (s_buns, 'Bread Toast', 'Golden buttered toast, crisp and warm.', 50, 'veg', 'none', true),
  (s_buns, 'Bread Omelette', 'Fluffy masala omelette sandwiched in toasted bread.', 80, 'non_veg', 'popular', true),
  -- Cakes
  (s_cakes, 'Tea Cake', 'Simple light sponge, perfect with a cup of tea.', 25, 'veg', 'none', true),
  (s_cakes, 'Honey Cake', 'Soft cake sweetened with honey.', 25, 'veg', 'none', true),
  (s_cakes, 'Russian Cake', 'Old style bakery cake with a caramel hint.', 25, 'veg', 'none', true),
  (s_cakes, 'Vanilla Cake', 'Classic vanilla sponge slice.', 25, 'veg', 'none', true),
  (s_cakes, 'Chocolate Cake', 'Moist chocolate sponge slice.', 25, 'veg', 'popular', true),
  (s_cakes, 'Banana Cake', 'Soft banana loaf, naturally sweet.', 35, 'veg', 'none', true),
  (s_cakes, 'Pudding Cake', 'Rich pudding style cake slice.', 35, 'veg', 'none', true),
  -- Pastries
  (s_pastries, 'Strawberry', 'Cream pastry topped with sweet strawberry.', 80, 'veg', 'none', true),
  (s_pastries, 'Blueberry', 'Pastry layered with blueberry filling and cream.', 80, 'veg', 'none', true),
  (s_pastries, 'Black Forest', 'Chocolate sponge, cream and cherries.', 80, 'veg', 'popular', true),
  (s_pastries, 'White Forest', 'White chocolate and cream pastry with cherries.', 80, 'veg', 'none', true),
  (s_pastries, 'Chocolate Truffle', 'Rich dark chocolate truffle pastry.', 100, 'veg', 'popular', true),
  (s_pastries, 'Mango', 'Cream pastry with sweet ripe mango.', 80, 'veg', 'none', true),
  (s_pastries, 'Orange', 'Fresh cream pastry with a bright orange flavour.', 80, 'veg', 'none', true),
  (s_pastries, 'Pineapple', 'Pastry with pineapple filling and fresh cream.', 80, 'veg', 'none', true),
  (s_pastries, 'Butter Scotch', 'Caramel butterscotch pastry with a crunchy topping.', 80, 'veg', 'none', true),
  (s_pastries, 'Cheese Cake', 'Creamy baked cheesecake slice.', 150, 'veg', true, true);
end $$;
