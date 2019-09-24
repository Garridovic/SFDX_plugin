Pricebook2 standardPricebook = [select Id, IsActive from PriceBook2 where IsStandard=True];

Product2 product1 = new Product2(Name='Product 1', Family='Container', Description='Product 1 Description');
insert product1;

Product2 product2 = new Product2(Name='Product 2', Family='Container', Description='Product 2 Description');
insert product2;

Product2 product3 = new Product2(Name='Product 3', Family='Container', Description='Product 3 Description');
insert product3;


// Create a pricebook entry
PricebookEntry pbe1 = new PricebookEntry (Pricebook2Id=standardPricebook.id, Product2Id=product1.id, IsActive=true, UnitPrice=100.0);
insert pbe1;

PricebookEntry pbe2 = new PricebookEntry (Pricebook2Id=standardPricebook.id, Product2Id=product2.id, IsActive=true, UnitPrice=50.0);
insert pbe2;

PricebookEntry pbe3 = new PricebookEntry (Pricebook2Id=standardPricebook.id, Product2Id=product3.id, IsActive=true, UnitPrice=125.0);
insert pbe3;