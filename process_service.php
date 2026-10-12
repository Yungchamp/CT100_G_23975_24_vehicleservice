<?php
/**
 * ==============================================================
 *  process_service.php  -  AutoCare Garage
 * ==============================================================
 *  Receives the booking form from service.html (sent with POST).
 *
 *  What this file does, in order:
 *    1. Makes sure the page was reached through a POST request.
 *    2. Reads every field and validates it on the server.
 *       (JavaScript can be switched off or bypassed, so the
 *       server must never assume the data is already clean.)
 *    3. Works out the total cost ITSELF from the price list below.
 *       The total sent by the browser is NOT trusted; it is only
 *       compared with ours so we can warn if they differ.
 *    4. Shows either a booking confirmation (receipt) or a clear
 *       error page.
 *
 *  Works with PHP 7.0 or newer (XAMPP's PHP is fine).
 * ==============================================================
 */

// Use the garage's local time for the booking timestamp and date checks
date_default_timezone_set('Africa/Nairobi');
header('Content-Type: text/html; charset=UTF-8');


/* --------------------------------------------------------------
   1. PRICE LIST AND ALLOWED VALUES (the server's own copy)
   Keep the service keys and prices in step with script.js and
   the checkboxes in service.html.
   -------------------------------------------------------------- */
const SERVICE_CATALOG = [
    'oil_change'         => ['name' => 'Engine Oil Change',  'price' => 3000],
    'brake_inspection'   => ['name' => 'Brake Inspection',   'price' => 2000],
    'wheel_alignment'    => ['name' => 'Wheel Alignment',    'price' => 2500],
    'computer_diagnosis' => ['name' => 'Computer Diagnosis', 'price' => 3500],
    'full_service'       => ['name' => 'Full Service',       'price' => 8000],
];

// INDIVIDUAL REQUIREMENT (admission number ends in 5):
// optional vehicle pickup and delivery, a flat KSh 1,500.
const PICKUP_DELIVERY_FEE   = 1500;
const PICKUP_DELIVERY_LABEL = 'Vehicle Pickup & Delivery';

const VEHICLE_TYPES    = ['Saloon Car', 'SUV', 'Pickup', 'Van'];
const VEHICLE_MODELS   = ['Toyota', 'Nissan', 'Subaru', 'Mazda', 'Honda', 'Other'];
const MIN_VEHICLE_YEAR = 1980;


/* --------------------------------------------------------------
   2. HELPER FUNCTIONS
   -------------------------------------------------------------- */

/**
 * Cleans a value so it is safe to print inside HTML.
 * htmlspecialchars() turns characters such as < > & " ' into harmless
 * text, which stops anyone injecting HTML or JavaScript into the page.
 */
function sanitize($value)
{
    return htmlspecialchars(trim((string) $value), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Reads one text field from $_POST.
 * Returns an empty string if the field is missing, or if someone sent
 * an array instead of text (which would otherwise cause PHP warnings).
 */
function postText($field)
{
    if (isset($_POST[$field]) && is_string($_POST[$field])) {
        return trim($_POST[$field]);
    }
    return '';
}

/** 3000 becomes "KSh 3,000". */
function formatKsh($amount)
{
    return 'KSh ' . number_format($amount);
}

/**
 * Works out the cost of a booking from the price list above.
 *
 * It loops over OUR price list and checks which services were ticked,
 * so a service sent twice is only charged once and an unknown service
 * can never add anything to the total.
 */
function calculateTotal(array $selectedKeys, $pickupSelected)
{
    $lines = [];
    $total = 0;

    foreach (SERVICE_CATALOG as $key => $service) {
        if (in_array($key, $selectedKeys, true)) {
            $lines[] = ['name' => $service['name'], 'price' => $service['price']];
            $total  += $service['price'];
        }
    }

    // Pickup and delivery is an optional add-on with its own fee
    $pickupFee = 0;
    if ($pickupSelected) {
        $pickupFee = PICKUP_DELIVERY_FEE;
        $total    += $pickupFee;
    }

    return ['lines' => $lines, 'pickupFee' => $pickupFee, 'total' => $total];
}


/* --------------------------------------------------------------
   3. PROCESS THE REQUEST
   $pageState decides which screen is shown further down:
     'not_post' - the page was opened directly (no form data)
     'errors'   - the form data failed validation
     'receipt'  - everything is valid, show the confirmation
   -------------------------------------------------------------- */
$pageState = 'receipt';
$errors    = [];
$booking   = [];

$requestMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';

if ($requestMethod !== 'POST') {

    // Someone typed the address into the browser instead of using the form
    $pageState = 'not_post';
    http_response_code(405);   // 405 = Method Not Allowed
    header('Allow: POST');

} else {

    // ----- Read the raw (trimmed) values -----
    // We validate the raw text first and escape it only when printing it.
    // Escaping first would turn an apostrophe in "O'Brien" into &#039;
    // and the name check below would wrongly reject it.
    $name      = postText('customer_name');
    $phone     = postText('phone');
    $email     = postText('email');
    $reg       = strtoupper(postText('reg_number'));
    $type      = postText('vehicle_type');
    $model     = postText('vehicle_model');
    $year      = postText('manufacture_year');
    $dateText  = postText('service_date');
    $pickup    = (postText('pickup_delivery') === 'yes');

    // ----- Customer name -----
    if ($name === '') {
        $errors[] = 'Customer name is required.';
    } elseif (!preg_match('/^\p{L}[\p{L}\s.\'\-]{1,59}$/uD', $name)) {
        $errors[] = 'Customer name must use letters only (2 to 60 characters). Spaces, hyphens and apostrophes are allowed.';
    }

    // ----- Phone number: exactly 10 digits -----
    if ($phone === '') {
        $errors[] = 'Phone number is required.';
    } elseif (!preg_match('/^[0-9]{10}$/D', $phone)) {
        $errors[] = 'Phone number must be exactly 10 digits, for example 0712345678.';
    }

    // ----- Email address -----
    if ($email === '') {
        $errors[] = 'Email address is required.';
    } elseif (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors[] = 'Email address is not valid.';
    }

    // ----- Vehicle registration number (for example KDA 123A) -----
    if ($reg === '') {
        $errors[] = 'Vehicle registration number is required.';
    } elseif (!preg_match('/^[A-Z]{2,4} ?[0-9]{1,4} ?[A-Z]?$/D', $reg)) {
        $errors[] = 'Vehicle registration number is not valid. Use a format such as KDA 123A.';
    }

    // ----- Vehicle type and make/model must be one of the allowed options -----
    if (!in_array($type, VEHICLE_TYPES, true)) {
        $errors[] = 'Please choose a vehicle type from the list.';
    }
    if (!in_array($model, VEHICLE_MODELS, true)) {
        $errors[] = 'Please choose a vehicle make or model from the list.';
    }

    // ----- Year of manufacture -----
    $currentYear = (int) date('Y');
    if ($year === '') {
        $errors[] = 'Year of manufacture is required.';
    } elseif (!preg_match('/^[0-9]{4}$/D', $year)
              || (int) $year < MIN_VEHICLE_YEAR
              || (int) $year > $currentYear) {
        $errors[] = 'Year of manufacture must be a 4-digit year between ' . MIN_VEHICLE_YEAR . ' and ' . $currentYear . '.';
    }

    // ----- Service date: a real date, from today up to one year ahead -----
    $serviceDate = DateTime::createFromFormat('!Y-m-d', $dateText);
    if ($dateText === '') {
        $errors[] = 'Preferred service date is required.';
    } elseif ($serviceDate === false || $serviceDate->format('Y-m-d') !== $dateText) {
        $errors[] = 'Preferred service date is not a valid date.';
    } else {
        $today  = new DateTime('today');
        $latest = new DateTime('today');
        $latest->modify('+1 year');

        if ($serviceDate < $today) {
            $errors[] = 'Preferred service date cannot be in the past.';
        } elseif ($serviceDate > $latest) {
            $errors[] = 'Preferred service date must be within the next 12 months.';
        }
    }

    // ----- Selected services -----
    $postedServices = (isset($_POST['services']) && is_array($_POST['services'])) ? $_POST['services'] : [];
    $selectedKeys   = [];
    $unknownService = false;

    foreach ($postedServices as $serviceKey) {
        if (is_string($serviceKey) && array_key_exists($serviceKey, SERVICE_CATALOG)) {
            $selectedKeys[] = $serviceKey;
        } else {
            $unknownService = true;   // a value that is not on our price list
        }
    }

    if ($unknownService) {
        $errors[] = 'One or more selected services are not on our price list.';
    } elseif (count($selectedKeys) === 0) {
        $errors[] = 'Please select at least one service.';
    }

    // ----- Decide what to show -----
    if (count($errors) > 0) {

        $pageState = 'errors';
        http_response_code(422);   // 422 = the data was received but is not acceptable

    } else {

        // Independent cost calculation: this is the amount that counts
        $result        = calculateTotal($selectedKeys, $pickup);
        $verifiedTotal = $result['total'];

        // The browser's own estimate, used ONLY to tell the customer if it differed
        $browserTotalText = postText('client_total');
        $browserTotal     = ctype_digit($browserTotalText) ? (int) $browserTotalText : null;
        $totalsDiffer     = ($browserTotal !== null && $browserTotal !== $verifiedTotal);

        // Prepare each service line for printing
        $serviceLines = [];
        foreach ($result['lines'] as $line) {
            $serviceLines[] = [
                'name'  => sanitize($line['name']),
                'price' => formatKsh($line['price']),
            ];
        }

        // Everything the receipt prints is escaped here (or built by PHP itself)
        $booking = [
            'name'          => sanitize($name),
            'phone'         => sanitize($phone),
            'email'         => sanitize($email),
            'reg'           => sanitize($reg),
            'type'          => sanitize($type),
            'model'         => sanitize($model),
            'year'          => sanitize($year),
            'dateLong'      => $serviceDate->format('j F Y'),            // e.g. 20 October 2026
            'serviceLines'  => $serviceLines,
            'pickup'        => $pickup,
            'pickupName'    => sanitize(PICKUP_DELIVERY_LABEL),
            'pickupPrice'   => formatKsh($result['pickupFee']),
            'totalText'     => formatKsh($verifiedTotal),
            'totalsDiffer'  => $totalsDiffer,
            'browserTotal'  => ($browserTotal !== null) ? formatKsh($browserTotal) : '',
            'reference'     => 'ACG-' . date('Ymd') . '-' . mt_rand(1000, 9999),
            'timestamp'     => date('j F Y, g:i:s A T'),                 // e.g. 8 October 2026, 3:42:10 PM EAT
        ];
    }
}

// Page title for the browser tab
if ($pageState === 'receipt') {
    $pageTitle = 'Booking confirmation';
} elseif ($pageState === 'errors') {
    $pageTitle = 'Check your details';
} else {
    $pageTitle = 'Booking form needed';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $pageTitle ?> | AutoCare Garage</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='5' fill='%23f4c20d'/%3E%3Ctext x='16' y='22' font-size='15' font-weight='700' text-anchor='middle' font-family='Arial' fill='%231c2321'%3EAC%3C/text%3E%3C/svg%3E">

  <!-- Bootstrap 5 and Bootstrap Icons (loaded from a CDN, so an internet connection is needed) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

  <!-- Barlow fonts. If they fail to load, the fallbacks in style.css are used -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap">

  <!-- Our own styles (must come after Bootstrap) -->
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <!-- ===================== NAVIGATION ===================== -->
  <nav class="navbar navbar-expand-lg navbar-dark site-nav sticky-top">
    <div class="container">
      <a class="navbar-brand d-flex align-items-center gap-2" href="index.html">
        <span class="brand-mark" aria-hidden="true">AC</span>
        <span>AutoCare Garage</span>
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav"
              aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto align-items-lg-center gap-lg-1">
          <li class="nav-item"><a class="nav-link" href="index.html">Home</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#prices">Price list</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#how-it-works">How it works</a></li>
          <li class="nav-item ms-lg-2 mt-2 mt-lg-0">
            <a class="btn btn-plate btn-sm" href="service.html">Book a service</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>

  <!-- ===================== PAGE CONTENT ===================== -->
  <main class="container py-5">

<?php if ($pageState === 'receipt'): ?>

    <!-- ---------- BOOKING CONFIRMATION ---------- -->
    <article class="receipt">

      <header class="receipt-head">
        <div>
          <h1>SERVICE REQUEST RECEIVED</h1>
          <p class="mb-0">Thank you, <?= $booking['name'] ?>. We have received your booking request.</p>
        </div>
        <span class="receipt-stamp">Status: Received</span>
      </header>

      <div class="receipt-body">

        <div class="receipt-meta">
          <span><strong>Reference:</strong> <?= $booking['reference'] ?></span>
          <span><strong>Booked on:</strong> <?= $booking['timestamp'] ?></span>
        </div>

        <div class="row g-4">
          <div class="col-md-6">
            <h2 class="receipt-section">Customer details</h2>
            <dl class="detail-list">
              <div><dt>Customer</dt><dd><?= $booking['name'] ?></dd></div>
              <div><dt>Phone</dt><dd><?= $booking['phone'] ?></dd></div>
              <div><dt>Email</dt><dd><?= $booking['email'] ?></dd></div>
            </dl>
          </div>

          <div class="col-md-6">
            <h2 class="receipt-section">Vehicle details</h2>
            <dl class="detail-list">
              <div><dt>Vehicle</dt><dd><span class="plate-badge"><?= $booking['reg'] ?></span></dd></div>
              <div><dt>Vehicle Type</dt><dd><?= $booking['type'] ?></dd></div>
              <div><dt>Make / model</dt><dd><?= $booking['model'] ?></dd></div>
              <div><dt>Year of manufacture</dt><dd><?= $booking['year'] ?></dd></div>
            </dl>
          </div>
        </div>

        <h2 class="receipt-section">Appointment</h2>
        <dl class="detail-list">
          <div><dt>Service Date</dt><dd><?= $booking['dateLong'] ?></dd></div>
        </dl>

        <h2 class="receipt-section">Selected Services</h2>
        <div class="table-responsive">
          <table class="table receipt-table">
            <thead>
              <tr class="group-row">
                <th scope="col">Service</th>
                <th scope="col" class="amount">Charge</th>
              </tr>
            </thead>
            <tbody>
<?php foreach ($booking['serviceLines'] as $line): ?>
              <tr>
                <td><?= $line['name'] ?></td>
                <td class="amount"><?= $line['price'] ?></td>
              </tr>
<?php endforeach; ?>
            </tbody>
            <tbody>
              <tr class="group-row">
                <th scope="colgroup" colspan="2">Add-ons</th>
              </tr>
<?php if ($booking['pickup']): ?>
              <tr class="row-pickup">
                <td><i class="bi bi-truck me-1" aria-hidden="true"></i><?= $booking['pickupName'] ?></td>
                <td class="amount"><?= $booking['pickupPrice'] ?></td>
              </tr>
<?php else: ?>
              <tr>
                <td colspan="2" class="text-secondary">No vehicle pickup &amp; delivery requested.</td>
              </tr>
<?php endif; ?>
            </tbody>
          </table>
        </div>

      </div>

      <!-- Final verified total, calculated by this PHP file -->
      <div class="receipt-total">
        <span class="label">ESTIMATED SERVICE COST</span>
        <span class="amount"><?= $booking['totalText'] ?></span>
      </div>

      <div class="receipt-body">

<?php if ($booking['totalsDiffer']): ?>
        <div class="alert alert-warning" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-2" aria-hidden="true"></i>
          The estimate shown in your browser (<?= $booking['browserTotal'] ?>) did not match our price list.
          The verified total above is the amount that applies.
        </div>
<?php else: ?>
        <p class="mb-2">
          <i class="bi bi-patch-check-fill text-success me-1" aria-hidden="true"></i>
          Verified by our server. The total was calculated from our price list when you submitted the form.
        </p>
<?php endif; ?>

        <p class="mb-0">We will call <strong><?= $booking['phone'] ?></strong> to confirm your service slot.</p>

        <div class="d-flex flex-wrap gap-2 mt-4 no-print">
          <a href="service.html" class="btn btn-plate">Book another service</a>
          <button type="button" class="btn btn-outline-dark" onclick="window.print()">Print confirmation</button>
          <a href="index.html" class="btn btn-outline-dark">Back to home</a>
        </div>

      </div>
    </article>

<?php elseif ($pageState === 'errors'): ?>

    <!-- ---------- VALIDATION ERRORS ---------- -->
    <section class="form-panel" aria-labelledby="errorHeading">
      <h1 class="panel-title" id="errorHeading">We could not process your request</h1>
      <p>Fix the following and submit the form again:</p>
      <ul class="mb-4">
<?php foreach ($errors as $error): ?>
        <li><?= sanitize($error) ?></li>
<?php endforeach; ?>
      </ul>
      <!-- history.back() keeps what the customer already typed; the link is the fallback -->
      <a href="service.html" class="btn btn-plate"
         onclick="if (history.length > 1) { history.back(); return false; }">Go back and fix the details</a>
    </section>

<?php else: ?>

    <!-- ---------- PAGE OPENED DIRECTLY (NO POST DATA) ---------- -->
    <section class="form-panel" aria-labelledby="directHeading">
      <h1 class="panel-title" id="directHeading">Open the booking form first</h1>
      <p class="mb-4">This page only receives booking requests. Fill in the booking form and submit it to see your confirmation here.</p>
      <a href="service.html" class="btn btn-plate">Go to the booking form</a>
    </section>

<?php endif; ?>

  </main>

  <!-- ===================== FOOTER ===================== -->
  <footer class="site-footer">
    <div class="container">
      <div class="row g-4">
        <div class="col-md-5">
          <h2>AutoCare Garage</h2>
          <p class="mb-0">Maintenance and repair for saloon cars, SUVs, pickups and vans. Book online and know your cost before you arrive.</p>
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <h2>Pages</h2>
          <ul class="list-unstyled mb-0">
            <li><a href="index.html">Home</a></li>
            <li><a href="index.html#prices">Price list</a></li>
            <li><a href="service.html">Book a service</a></li>
          </ul>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <h2>Contact</h2>
          <ul class="list-unstyled mb-0">
            <li><i class="bi bi-telephone-fill me-2" aria-hidden="true"></i>0717 830 032</li>
            <li><i class="bi bi-envelope-fill me-2" aria-hidden="true"></i>briankiruiyung@gmail.com</li>
            <li><i class="bi bi-clock-fill me-2" aria-hidden="true"></i>Mon to Sat, 8:00 am to 6:00 pm</li>
          </ul>
        </div>
      </div>
      <p class="footer-legal">&copy; 2026 AutoCare Garage.</p>
    </div>
  </footer>

  <!-- Bootstrap's JavaScript (needed for the mobile menu) -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
