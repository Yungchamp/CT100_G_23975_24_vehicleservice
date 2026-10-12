/* =============================================================
   script.js  -  AutoCare Garage: Vehicle Service Booking
   =============================================================
   Client-side logic for service.html. It does three jobs:

     1. VALIDATION   - checks the form before it is submitted
     2. CALCULATOR   - works out the estimated cost as services
                       are ticked and unticked (including the
                       optional KSh 1,500 Pickup & Delivery fee)
     3. DYNAMIC UI   - updates the page without reloading it
                       (vehicle type info, selected services,
                       counter, warning for older vehicles)

   IMPORTANT: the total calculated here is only a convenience for
   the customer. process_service.php always recalculates the cost
   itself and never trusts the figure sent by the browser.
   ============================================================= */

'use strict';


/* -------------------------------------------------------------
   1. SETTINGS
   ------------------------------------------------------------- */

// Price list in Kenya Shillings (KSh).
// The keys must match the "value" of each checkbox in service.html
// and the keys of SERVICE_CATALOG in process_service.php.
const SERVICE_CATALOG = {
  oil_change:         { name: 'Engine Oil Change',  price: 3000 },
  brake_inspection:   { name: 'Brake Inspection',   price: 2000 },
  wheel_alignment:    { name: 'Wheel Alignment',    price: 2500 },
  computer_diagnosis: { name: 'Computer Diagnosis', price: 3500 },
  full_service:       { name: 'Full Service',       price: 8000 }
};

// INDIVIDUAL REQUIREMENT (admission number ends in 5):
// optional vehicle pickup and delivery, charged at a flat KSh 1,500.
const PICKUP_DELIVERY_FEE = 1500;
const PICKUP_DELIVERY_LABEL = 'Vehicle Pickup & Delivery';

// Year limits used by the validation and the older-vehicle warning
const MIN_VEHICLE_YEAR = 1980;   // oldest year we accept
const OLD_VEHICLE_YEAR = 2010;   // vehicles built before this get a warning

// Patterns used by the validation
const NAME_PATTERN  = /^[\p{L}][\p{L}\s.'-]{1,59}$/u;        // letters, spaces, . ' -
const PHONE_PATTERN = /^[0-9]{10}$/;                          // exactly 10 digits
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;           // something@something.something
const REG_PATTERN   = /^[A-Z]{2,4} ?[0-9]{1,4} ?[A-Z]?$/;     // e.g. KDA 123A

// Text shown when the customer picks a vehicle type
const VEHICLE_TYPE_INFO = {
  'Saloon Car': 'Saloon cars are serviced in our standard bays. Allow about 3 to 4 hours.',
  'SUV':        'SUVs take more engine oil and have larger brakes, so allow about 4 to 5 hours.',
  'Pickup':     'Pickups often carry heavy loads, so a Brake Inspection and Wheel Alignment are worth adding. Allow about 4 to 5 hours.',
  'Van':        'Vans work long hours under load, so a Brake Inspection is worth adding. Allow about 4 to 6 hours.'
};


/* -------------------------------------------------------------
   2. PAGE ELEMENTS
   Filled in by initServiceForm() once the page has loaded.
   ------------------------------------------------------------- */
const ui = {};


/* -------------------------------------------------------------
   3. SMALL HELPERS
   ------------------------------------------------------------- */

// 3000 -> "KSh 3,000"
function formatKsh(amount) {
  return 'KSh ' + Number(amount).toLocaleString('en-US');
}

// Turns a Date into "YYYY-MM-DD" using the visitor's local time.
// (toISOString() would use UTC and could be a day out.)
function toISODate(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

// Earliest allowed service date is today, latest is one year from today
function getDateLimits() {
  const today = new Date();
  const latest = new Date();
  latest.setFullYear(latest.getFullYear() + 1);
  return { min: toISODate(today), max: toISODate(latest) };
}

// Respect visitors who asked their device to reduce motion
function getScrollBehavior() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

// Returns the checkbox for one service, e.g. getServiceCheckbox('computer_diagnosis')
function getServiceCheckbox(key) {
  return ui.serviceCheckboxes.find(function (box) {
    return box.value === key;
  });
}

// Returns the keys of every ticked service, e.g. ['oil_change', 'full_service']
function getSelectedServiceKeys() {
  const keys = [];
  ui.serviceCheckboxes.forEach(function (box) {
    // Only count values that really exist in the price list
    if (box.checked && Object.prototype.hasOwnProperty.call(SERVICE_CATALOG, box.value)) {
      keys.push(box.value);
    }
  });
  return keys;
}


/* -------------------------------------------------------------
   4. VALIDATION
   Each check receives the trimmed value and returns an error
   message, or an empty string when the value is fine.
   ------------------------------------------------------------- */
const FIELD_CHECKS = {

  customerName: function (value) {
    if (value === '') {
      return 'Enter your full name.';
    }
    if (!NAME_PATTERN.test(value)) {
      return 'Use letters only (2 to 60 characters). Spaces, hyphens and apostrophes are allowed.';
    }
    return '';
  },

  phone: function (value) {
    if (value === '') {
      return 'Enter your phone number.';
    }
    if (!PHONE_PATTERN.test(value)) {
      return 'Phone number must be exactly 10 digits, for example 0712345678.';
    }
    return '';
  },

  email: function (value) {
    if (value === '') {
      return 'Enter your email address.';
    }
    if (!EMAIL_PATTERN.test(value)) {
      return 'Enter a valid email address, for example jane@example.com.';
    }
    return '';
  },

  regNumber: function (value) {
    const plate = value.toUpperCase();
    if (plate === '') {
      return 'Enter the vehicle registration number.';
    }
    if (!REG_PATTERN.test(plate)) {
      return 'Enter a valid registration number, for example KDA 123A.';
    }
    return '';
  },

  vehicleType: function (value) {
    if (!Object.prototype.hasOwnProperty.call(VEHICLE_TYPE_INFO, value)) {
      return 'Choose a vehicle type.';
    }
    return '';
  },

  vehicleModel: function (value) {
    if (value === '') {
      return 'Choose the vehicle make or model.';
    }
    return '';
  },

  manufactureYear: function (value) {
    const currentYear = new Date().getFullYear();
    if (value === '') {
      return 'Enter the year of manufacture.';
    }
    if (!/^[0-9]{4}$/.test(value)) {
      return 'Enter the year as 4 digits, for example 2015.';
    }
    const year = parseInt(value, 10);
    if (year < MIN_VEHICLE_YEAR || year > currentYear) {
      return 'The year must be between ' + MIN_VEHICLE_YEAR + ' and ' + currentYear + '.';
    }
    return '';
  },

  serviceDate: function (value) {
    const limits = getDateLimits();
    if (value === '') {
      return 'Choose your preferred service date.';
    }
    // ISO dates (YYYY-MM-DD) can be compared as plain text
    if (value < limits.min) {
      return 'The service date cannot be in the past. Choose today or a later date.';
    }
    if (value > limits.max) {
      return 'Choose a date within the next 12 months.';
    }
    return '';
  }
};

// Marks a field as invalid and shows its message
function showFieldError(field, message) {
  const messageBox = document.getElementById(field.id + 'Error');
  field.classList.remove('is-valid');
  field.classList.add('is-invalid');
  field.setAttribute('aria-invalid', 'true');
  if (messageBox) {
    messageBox.textContent = message;
  }
}

// Marks a field as valid and clears its message
function showFieldSuccess(field) {
  const messageBox = document.getElementById(field.id + 'Error');
  field.classList.remove('is-invalid');
  field.classList.add('is-valid');
  field.removeAttribute('aria-invalid');
  if (messageBox) {
    messageBox.textContent = '';
  }
}

// Removes every validation mark from a field (used by Reset)
function clearFieldState(field) {
  const messageBox = document.getElementById(field.id + 'Error');
  field.classList.remove('is-valid', 'is-invalid');
  field.removeAttribute('aria-invalid');
  if (messageBox) {
    messageBox.textContent = '';
  }
}

// Validates one field. Returns true when it is fine.
function validateField(field) {
  const check = FIELD_CHECKS[field.id];
  const message = check ? check(field.value.trim()) : '';
  if (message !== '') {
    showFieldError(field, message);
    return false;
  }
  showFieldSuccess(field);
  return true;
}

// At least one service must be ticked. Returns true when it is.
function validateServices() {
  const hasService = getSelectedServiceKeys().length > 0;
  ui.servicesError.classList.toggle('d-block', !hasService);
  ui.serviceGroup.classList.toggle('has-error', !hasService);
  return hasService;
}

/*
 * validateServiceForm()
 * Runs every check, shows all the error messages at once and
 * moves the cursor to the first problem. Returns true only when
 * the whole form is valid.
 */
function validateServiceForm() {
  let errorCount = 0;
  let firstInvalid = null;

  ui.fields.forEach(function (field) {
    if (!validateField(field)) {
      errorCount++;
      if (firstInvalid === null) {
        firstInvalid = field;
      }
    }
  });

  if (!validateServices()) {
    errorCount++;
    if (firstInvalid === null) {
      firstInvalid = ui.serviceCheckboxes[0];
    }
  }

  if (errorCount > 0) {
    ui.formAlertText.textContent = 'Fix the ' + errorCount +
      (errorCount === 1 ? ' problem' : ' problems') + ' highlighted below, then submit again.';
    ui.formAlert.classList.remove('d-none');
    firstInvalid.scrollIntoView({ behavior: getScrollBehavior(), block: 'center' });
    firstInvalid.focus({ preventScroll: true });
    return false;
  }

  ui.formAlert.classList.add('d-none');
  return true;
}


/* -------------------------------------------------------------
   5. COST CALCULATOR
   ------------------------------------------------------------- */

// Draws the itemised lines and the total in the estimate ticket
function renderCostSummary(lines, total) {
  // Remove the lines from the last calculation
  while (ui.costLines.firstChild) {
    ui.costLines.removeChild(ui.costLines.firstChild);
  }

  lines.forEach(function (line) {
    const item = document.createElement('li');
    item.className = 'ticket-line' + (line.isPickup ? ' is-pickup' : '');

    const name = document.createElement('span');
    name.className = 'ticket-name';
    name.textContent = line.label;

    const leader = document.createElement('span');   // the dotted line
    leader.className = 'ticket-leader';
    leader.setAttribute('aria-hidden', 'true');

    const price = document.createElement('span');
    price.className = 'ticket-price';
    price.textContent = formatKsh(line.price);

    item.appendChild(name);
    item.appendChild(leader);
    item.appendChild(price);
    ui.costLines.appendChild(item);
  });

  ui.costEmpty.classList.toggle('d-none', lines.length > 0);
  ui.totalAmount.textContent = formatKsh(total);

  // The hidden field lets the server compare its own total with ours
  ui.clientTotal.value = String(total);
}

/*
 * calculateServiceCost()
 * Adds up every ticked service plus the pickup and delivery fee
 * (when ticked), updates the ticket and returns the total.
 */
function calculateServiceCost() {
  const lines = [];
  let total = 0;

  getSelectedServiceKeys().forEach(function (key) {
    const service = SERVICE_CATALOG[key];
    lines.push({ label: service.name, price: service.price, isPickup: false });
    total += service.price;
  });

  // Individual requirement: add the KSh 1,500 pickup and delivery fee
  if (ui.pickup.checked) {
    lines.push({ label: PICKUP_DELIVERY_LABEL, price: PICKUP_DELIVERY_FEE, isPickup: true });
    total += PICKUP_DELIVERY_FEE;
  }

  renderCostSummary(lines, total);
  return total;
}


/* -------------------------------------------------------------
   6. DYNAMIC BEHAVIOUR (no page reload)
   ------------------------------------------------------------- */

// Highlights ticked rows and updates the "2 services selected" badge
function updateSelectedServices() {
  const count = getSelectedServiceKeys().length;

  ui.serviceCheckboxes.forEach(function (box) {
    const row = box.closest('.service-option');
    if (row) {
      row.classList.toggle('is-selected', box.checked);
    }
  });
  ui.pickupRow.classList.toggle('is-selected', ui.pickup.checked);

  ui.serviceCount.textContent = count + (count === 1 ? ' service selected' : ' services selected');
  ui.serviceCount.classList.toggle('has-items', count > 0);
}

// Shows a short note that matches the chosen vehicle type
function updateVehicleTypeInfo() {
  const type = ui.vehicleType.value;

  if (!Object.prototype.hasOwnProperty.call(VEHICLE_TYPE_INFO, type)) {
    ui.vehicleTypeInfo.classList.add('d-none');
    return;
  }

  ui.vehicleTypeTitle.textContent = type + ':';
  ui.vehicleTypeText.textContent = VEHICLE_TYPE_INFO[type];
  ui.vehicleTypeInfo.classList.remove('d-none');
}

/*
 * checkVehicleAge()
 * Shows a warning for vehicles built before OLD_VEHICLE_YEAR and
 * offers a one-click way to add Computer Diagnosis.
 * Returns true when the warning is showing.
 */
function checkVehicleAge() {
  const yearText = ui.manufactureYear.value.trim();
  const year = /^[0-9]{4}$/.test(yearText) ? parseInt(yearText, 10) : NaN;
  const isOld = !isNaN(year) && year >= MIN_VEHICLE_YEAR && year < OLD_VEHICLE_YEAR;

  ui.ageWarning.classList.toggle('d-none', !isOld);
  if (!isOld) {
    return false;
  }

  const age = new Date().getFullYear() - year;
  ui.ageWarningText.textContent = 'This vehicle is about ' + age + ' years old (built before ' +
    OLD_VEHICLE_YEAR + '). Older vehicles often have faults you cannot see, so we recommend a Computer Diagnosis.';

  // Offer the button only while Computer Diagnosis is not already ticked
  const diagnosisBox = getServiceCheckbox('computer_diagnosis');
  const alreadyChosen = Boolean(diagnosisBox && diagnosisBox.checked);
  ui.addDiagnosisBtn.classList.toggle('d-none', alreadyChosen);
  ui.diagnosisAdded.classList.toggle('d-none', !alreadyChosen);
  return true;
}

// Runs whenever a service or the pickup option is ticked or unticked
function handleServiceChange() {
  updateSelectedServices();
  calculateServiceCost();
  checkVehicleAge();

  // Clear the "select at least one service" error as soon as one is ticked
  if (getSelectedServiceKeys().length > 0) {
    ui.servicesError.classList.remove('d-block');
    ui.serviceGroup.classList.remove('has-error');
  }
}

// Brings every dynamic part of the page in line with the current field values
function refreshDynamicUi() {
  updateVehicleTypeInfo();
  handleServiceChange();   // also refreshes the cost, counter and age warning
}

// Runs after the Reset button has cleared the form
function resetFormState() {
  ui.fields.forEach(clearFieldState);
  ui.servicesError.classList.remove('d-block');
  ui.serviceGroup.classList.remove('has-error');
  ui.formAlert.classList.add('d-none');
  refreshDynamicUi();
}


/* -------------------------------------------------------------
   7. START-UP: find the elements and attach the events
   ------------------------------------------------------------- */
function initServiceForm() {
  ui.form = document.getElementById('serviceForm');
  if (!ui.form) {
    return;   // this page has no booking form, so there is nothing to do
  }

  // Alert and error boxes
  ui.formAlert       = document.getElementById('formAlert');
  ui.formAlertText   = document.getElementById('formAlertText');
  ui.servicesError   = document.getElementById('servicesError');
  ui.serviceGroup    = document.getElementById('serviceGroup');

  // Form fields
  ui.customerName    = document.getElementById('customerName');
  ui.phone           = document.getElementById('phone');
  ui.email           = document.getElementById('email');
  ui.regNumber       = document.getElementById('regNumber');
  ui.vehicleType     = document.getElementById('vehicleType');
  ui.vehicleModel    = document.getElementById('vehicleModel');
  ui.manufactureYear = document.getElementById('manufactureYear');
  ui.serviceDate     = document.getElementById('serviceDate');

  // Services and pickup option
  ui.serviceCheckboxes = Array.from(document.querySelectorAll('.service-checkbox'));
  ui.pickup          = document.getElementById('pickupDelivery');
  ui.pickupRow       = document.getElementById('pickupRow');
  ui.serviceCount    = document.getElementById('serviceCount');

  // Dynamic messages
  ui.vehicleTypeInfo  = document.getElementById('vehicleTypeInfo');
  ui.vehicleTypeTitle = document.getElementById('vehicleTypeTitle');
  ui.vehicleTypeText  = document.getElementById('vehicleTypeText');
  ui.ageWarning       = document.getElementById('ageWarning');
  ui.ageWarningText   = document.getElementById('ageWarningText');
  ui.addDiagnosisBtn  = document.getElementById('addDiagnosisBtn');
  ui.diagnosisAdded   = document.getElementById('diagnosisAdded');

  // Estimate ticket
  ui.costLines   = document.getElementById('costLines');
  ui.costEmpty   = document.getElementById('costEmpty');
  ui.totalAmount = document.getElementById('totalAmount');
  ui.clientTotal = document.getElementById('clientTotal');

  // Groups of fields (the order matches the order on the page)
  ui.textFields   = [ui.customerName, ui.phone, ui.email, ui.regNumber, ui.manufactureYear];
  ui.choiceFields = [ui.vehicleType, ui.vehicleModel, ui.serviceDate];
  ui.fields = [ui.customerName, ui.phone, ui.email, ui.regNumber,
               ui.vehicleType, ui.vehicleModel, ui.manufactureYear, ui.serviceDate];

  // The date picker only offers dates from today up to one year ahead
  const limits = getDateLimits();
  ui.serviceDate.min = limits.min;
  ui.serviceDate.max = limits.max;

  // The button label shows the live price from the price list
  ui.addDiagnosisBtn.textContent = 'Add Computer Diagnosis (' +
    formatKsh(SERVICE_CATALOG.computer_diagnosis.price) + ')';


  /* ----- EVENT: input (fires on every keystroke) ----- */

  // Show the registration number in capital letters, keeping the cursor where it was
  ui.regNumber.addEventListener('input', function () {
    const start = ui.regNumber.selectionStart;
    const end = ui.regNumber.selectionEnd;
    ui.regNumber.value = ui.regNumber.value.toUpperCase();
    ui.regNumber.setSelectionRange(start, end);
  });

  // Check the vehicle's age while the year is being typed
  ui.manufactureYear.addEventListener('input', checkVehicleAge);

  // Once a field shows an error, re-check it on every keystroke so the error
  // disappears as soon as the value is fixed
  ui.textFields.forEach(function (field) {
    field.addEventListener('input', function () {
      if (field.classList.contains('is-invalid')) {
        validateField(field);
      }
    });

    // EVENT: blur - check a text field when the customer leaves it.
    // Empty fields are left alone here and reported when the form is submitted.
    field.addEventListener('blur', function () {
      if (field.value.trim() !== '') {
        validateField(field);
      }
    });
  });


  /* ----- EVENT: change (fires when a choice is made) ----- */

  ui.choiceFields.forEach(function (field) {
    field.addEventListener('change', function () {
      validateField(field);
    });
  });

  ui.vehicleType.addEventListener('change', updateVehicleTypeInfo);

  ui.serviceCheckboxes.forEach(function (box) {
    box.addEventListener('change', handleServiceChange);
  });
  ui.pickup.addEventListener('change', handleServiceChange);


  /* ----- EVENT: click ----- */

  // "Add Computer Diagnosis" button in the older-vehicle warning
  ui.addDiagnosisBtn.addEventListener('click', function () {
    const diagnosisBox = getServiceCheckbox('computer_diagnosis');
    if (diagnosisBox) {
      diagnosisBox.checked = true;
      handleServiceChange();
    }
  });


  /* ----- EVENT: submit ----- */

  ui.form.addEventListener('submit', function (event) {
    if (!validateServiceForm()) {
      event.preventDefault();   // an invalid form must not be sent
      return;
    }
    calculateServiceCost();     // make sure the hidden total is up to date
  });


  /* ----- EVENT: reset ----- */

  // The browser clears the fields AFTER this event, so wait a moment
  // before tidying up the messages and the estimate.
  ui.form.addEventListener('reset', function () {
    window.setTimeout(resetFormState, 0);
  });

  // Also runs when the visitor comes back with the Back button, because
  // the browser may restore the field values after the page has loaded
  window.addEventListener('pageshow', refreshDynamicUi);

  // The "Book with pickup" button on the home page opens this page with ?pickup=1,
  // so the pickup and delivery option is already ticked
  if (new URLSearchParams(window.location.search).get('pickup') === '1') {
    ui.pickup.checked = true;
  }

  // First paint: empty estimate, no messages
  refreshDynamicUi();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initServiceForm);
} else {
  initServiceForm();
}
