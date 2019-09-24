public class DemoPageController {

	public InputDataWrapper wrapper {get;set;}
	public List<OrderItemWrapper> prices {get;set;}

	public DemoPageController()
	{
		wrapper = new InputDataWrapper();
		List<PricebookEntry> pbes = [SELECT Id, Name, UnitPrice, Product2.Id FROM PricebookEntry WHERE IsActive = true AND Product2.Id != NULL];

		prices = new List<OrderItemWrapper>();
		for(PricebookEntry pbe : pbes) {
			prices.add(new OrderItemWrapper(pbe));
		}
	}

	public PageReference processInfo(){

		if(null == wrapper.accountName || null == wrapper.contactName) {
			ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR, 'Account name or contact name missing'));
		}

		Pricebook2 standardPricebook2 = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
		if(null == standardPricebook2) {
			ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR, 'Please setup the standard pricebook'));
		}

		try{
			Account newAccount = new Account();
			newAccount.Name = wrapper.accountName;

			insert newAccount;

			Contact newContact = new Contact();
			newContact.FirstName = wrapper.contactName;
			newContact.LastName = 'DreamOlé';
			newContact.AccountId = newAccount.Id;

			insert newContact;

			Datetime now = System.now();

			Opportunity newOpportunity = new Opportunity();
			newOpportunity.Name = wrapper.accountName + ' ' + now.format(' dd/MMMMM');
			newOpportunity.AccountId = newAccount.Id;
			newOpportunity.CloseDate = now.date();
			newOpportunity.StageName = 'Prospecting';
			newOpportunity.Pricebook2Id = standardPricebook2.Id;

			insert newOpportunity;

			List<OpportunityLineItem> opportunityLineItemsToInsert = new List<OpportunityLineItem>();
			for(OrderItemWrapper price: prices){

				if(price.checked){
					OpportunityLineItem opportunityLineItem = new OpportunityLineItem();
					opportunityLineItem.Product2Id = price.productId;
					opportunityLineItem.UnitPrice = price.productPrice;
					opportunityLineItem.OpportunityId = newOpportunity.Id;
					opportunityLineItem.Quantity = 1;

					opportunityLineItemsToInsert.add(opportunityLineItem);
				}
			}

			insert opportunityLineItemsToInsert;

			return new PageReference('/'+newOpportunity.Id);
		}catch (Exception e)
		{
			ApexPages.addMessage(new ApexPages.Message(ApexPages.Severity.ERROR, e.getMessage()));
		}

		return null;
	}

	public class InputDataWrapper {

		public String accountName {get;set;}
		public String contactName {get;set;}

		public InputDataWrapper(){}
	}


	public class OrderItemWrapper {

		public String productName {get;set;}
		public Decimal productPrice {get;set;}
		public Id productId {get;set;}
		public Id pricebookEntryId {get;set;}
		public Boolean checked {get;set;}

		public OrderItemWrapper(){}

		public OrderItemWrapper(PricebookEntry pbe){

			this.productName = pbe.Name;
			this.productPrice = pbe.UnitPrice;
			this.productId = pbe.Product2.Id;
			this.pricebookEntryId = pbe.Id;
			this.checked = false;
		}

	}
}